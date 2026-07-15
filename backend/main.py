"""
Riffly backend API (FastAPI).

Exposes the endpoints the frontend talks to:
    GET  /riffs           - all riffs (debug/seeding use)
    GET  /next-riff       - the recommender's pick for what to show next
    GET  /saved-riffs     - riffs the current session has saved
    GET  /interactions    - current like/save state for one riff+session
    POST /interact        - record a view/like/unlike/save/unsave event

Users are identified by an opaque `session_id` (a UUID the frontend stores
in a cookie) rather than an account, so every query below is scoped by
`session_id` instead of a logged-in user.

Recommendation engine: each session's affinity toward tags and difficulty
levels is maintained incrementally in SessionAffinity (updated by
POST /interact as events happen), rather than recomputed by replaying the
full interaction log on every read. /next-riff just reads those
precomputed scores, scores every unseen riff against them, and picks via
weighted random sampling (softmax) so the feed doesn't lock onto a single
tag/difficulty after one like.

SessionRiffState tracks the CURRENT like/save boolean per (session, riff),
used to (a) compute the correct delta when a like/save is toggled, so
like->unlike->like doesn't double-apply LIKE_WEIGHT, and (b) answer
GET /interactions and GET /saved-riffs directly, without replaying history.

The raw Interaction log is still written on every event and kept as an
audit trail / replay source — e.g. if LIKE_WEIGHT, SKIP_PIVOT, etc. ever
change, replaying this log is how you'd rebuild SessionAffinity under the
new weights. It's also the server-side source of truth for which riffs a
session has already viewed (see next_riff below).
"""

import math
import os
import random

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from fastapi.encoders import jsonable_encoder

from backend.core.database import SessionLocal
from backend.core.models import Riff, Interaction, SessionAffinity, SessionRiffState

# -------------------------
# RECOMMENDER TUNING CONSTANTS
# -------------------------
# Explicit-feedback weights
LIKE_WEIGHT = 3.0
SAVE_WEIGHT = 2.0

# View-completion scoring: score = (completion_ratio - SKIP_PIVOT) * VIEW_SCALE
# Watching further than the pivot point earns positive points that grow the
# closer the user gets to finishing; bailing out earlier than the pivot
# earns negative points that grow the earlier the skip happens.
SKIP_PIVOT = 0.8
VIEW_SCALE = 3.0

# Fallback riff length (seconds) if a riff somehow has no events to measure
DEFAULT_RIFF_DURATION = 8.0

# How heavily difficulty-level affinity factors into the final score,
# relative to tag affinity. Higher = the recommender leans harder toward
# difficulty levels the user has responded well to (and away from ones
# they've skipped/bounced off of).
# NOTE: lowered from 4.0 -> 1.2. At 4.0, a single like on one riff
# (LIKE_WEIGHT * DIFFICULTY_WEIGHT = 12.0 points dumped into that one
# difficulty bucket) completely swamped tag affinity and any other signal,
# which is why one like on a difficulty-4 riff locked every future
# recommendation onto difficulty 4.
# Applied at READ time (see difficulty_score), not baked into the stored
# SessionAffinity rows, so it stays tunable without a data migration.
DIFFICULTY_WEIGHT = 1.2

# Controls how "loose"/random the final pick is. This is used to turn raw
# scores into pick probabilities (softmax) instead of always taking the
# single highest-scoring riff. Higher = more exploratory/random, lower =
# more strictly follows the top score. ~1.0-2.5 is a good range to try.
SOFTMAX_TEMPERATURE = 1.5

app = FastAPI()

# Allowed frontend origins for CORS. Configurable via env var so the same
# code works across local dev (CRA on :3000, Vite on :5173) and prod
# without editing source — set RIFFLY_ALLOWED_ORIGINS to a comma-separated
# list of origins in whatever environment this is deployed to.
#
# NOTE: this used to be allow_origins=["*"] with allow_credentials=True.
# That combination is invalid for credentialed requests (browsers reject
# it), and since none of the frontend's fetch() calls currently set
# credentials: 'include' (session_id is passed as a query param, not a
# cookie, to this API), the wildcard wasn't actually doing anything
# unsafe today. Still, an explicit allowlist is what you want before this
# is exposed anywhere beyond localhost, so it's the default now.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "RIFFLY_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# DB Dependency
# -------------------------
def get_db():
    """FastAPI dependency that yields a DB session and always closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -------------------------
# RECOMMENDER HELPERS
# -------------------------
def riff_duration_seconds(riff: Riff) -> float:
    """Compute a riff's actual length from its note events."""
    events = riff.events or []
    if not events:
        return DEFAULT_RIFF_DURATION
    try:
        return max(float(e["start"]) + float(e["duration"]) for e in events)
    except (KeyError, TypeError, ValueError):
        return DEFAULT_RIFF_DURATION


def view_completion_score(duration_ms: int | None, riff_length_s: float) -> float:
    """
    Turn how long a user watched/played a riff into a signed score.
    Finishing (or nearly finishing) a riff is a strong positive signal;
    bailing out early is a negative signal, and the earlier the skip,
    the more negative it gets.
    """
    if not duration_ms or riff_length_s <= 0:
        return 0.0
    ratio = min((duration_ms / 1000.0) / riff_length_s, 1.0)
    return (ratio - SKIP_PIVOT) * VIEW_SCALE


def content_score(riff: Riff, tag_affinity: dict[str, float]) -> float:
    """Score a candidate riff by summing affinity across its tags (genre included, since it's tagged too)."""
    tags = riff.tags or []
    return sum(tag_affinity.get(tag, 0.0) for tag in tags)


def difficulty_score(riff: Riff, difficulty_affinity: dict[int, float]) -> float:
    """How well a candidate's difficulty level matches what the user responds well to."""
    return difficulty_affinity.get(riff.difficulty, 0.0) * DIFFICULTY_WEIGHT


def weighted_pick(scored: list[tuple[Riff, float]]) -> Riff:
    """
    Pick a riff using softmax-weighted random sampling over the candidate
    scores, instead of a strict argmax. Higher-scoring riffs are more
    *likely* to be picked, but lower-scoring ones still have a real (if
    smaller) chance. This is what keeps the recommender from locking onto
    a single difficulty/tag after just one or two interactions, since a
    slight score lead no longer means 100% certainty.
    """
    riffs_only = [r for r, _ in scored]
    scores_only = [s for _, s in scored]

    max_score = max(scores_only)
    # Subtract max score before exponentiating for numerical stability;
    # doesn't change the resulting probabilities.
    weights = [math.exp((s - max_score) / SOFTMAX_TEMPERATURE) for s in scores_only]

    return random.choices(riffs_only, weights=weights, k=1)[0]


# -------------------------
# AFFINITY WRITE HELPERS
# -------------------------
def tag_key(tag: str) -> str:
    return f"tag:{tag}"


def difficulty_key(level: int) -> str:
    return f"difficulty:{level}"


def apply_affinity_delta(db: Session, session_id: str, key: str, delta: float):
    """Upsert: add `delta` to a session's score for this key, starting from 0 if the row doesn't exist yet."""
    if delta == 0:
        return
    stmt = pg_insert(SessionAffinity).values(
        session_id=session_id, key=key, score=delta
    ).on_conflict_do_update(
        index_elements=["session_id", "key"],
        set_={"score": SessionAffinity.score + delta},
    )
    db.execute(stmt)


def get_or_create_riff_state(db: Session, session_id: str, riff_id: int) -> SessionRiffState:
    """Fetch this session's current like/save state for a riff, creating a fresh (False, False) row if none exists yet."""
    state = db.get(SessionRiffState, (session_id, riff_id))
    if state is None:
        state = SessionRiffState(session_id=session_id, riff_id=riff_id, liked=False, saved=False)
        db.add(state)
        db.flush()  # make visible within this same transaction before we read it again
    return state


def apply_toggle(db: Session, session_id: str, riff: Riff, weight: float, turning_on: bool):
    """Apply a like/save toggle's score delta, split across the riff's tags
    (same even-split logic tags always used) plus its difficulty bucket
    (unsplit, same as tags vs. difficulty always worked)."""
    delta = weight if turning_on else -weight
    tags = riff.tags or []
    if tags:
        per_tag = delta / len(tags)
        for tag in tags:
            apply_affinity_delta(db, session_id, tag_key(tag), per_tag)
    if riff.difficulty is not None:
        apply_affinity_delta(db, session_id, difficulty_key(riff.difficulty), delta)


# -------------------------
# GET ALL RIFFS
# -------------------------
@app.get("/riffs")
def get_riffs(db: Session = Depends(get_db)):
    """Return every riff in the database. Used for seeding checks/debugging, not by the main feed."""
    riffs = db.query(Riff).all()
    return jsonable_encoder(riffs)


# -------------------------
# INTERACTION MODEL
# -------------------------
class InteractionRequest(BaseModel):
    """Body for POST /interact. `duration_ms` is only meaningful for 'view' events."""
    riff_id: int
    interaction_type: str
    duration_ms: int | None = None
    session_id: str


# -------------------------
# ADD INTERACTION
# -------------------------
@app.post("/interact")
def add_interaction(req: InteractionRequest, db: Session = Depends(get_db)):
    """Record one interaction event (view/like/unlike/save/unsave) for a session+riff.

    Always writes the raw event to the Interaction log (audit trail), and
    additionally applies the correct score delta to SessionAffinity:
      - 'view'    : always applied, split across tags + difficulty bucket
      - like/save : only applied if it's an actual state CHANGE (checked
                    against SessionRiffState), so repeated like calls
                    without an unlike in between don't double-count.

    Note: user_id is hardcoded to 1 since there is no auth in the MVP;
    session_id (the cookie token) is what actually distinguishes users.
    """
    interaction = Interaction(
        user_id=1,
        session_id=req.session_id,
        riff_id=req.riff_id,
        interaction_type=req.interaction_type,
        duration_ms=req.duration_ms
    )
    db.add(interaction)

    riff = db.get(Riff, req.riff_id)
    t = (req.interaction_type or "").strip().lower()

    if riff is not None:
        if t == "view":
            length = riff_duration_seconds(riff)
            score = view_completion_score(req.duration_ms, length)
            tags = riff.tags or []
            if tags and score != 0:
                per_tag = score / len(tags)
                for tag in tags:
                    apply_affinity_delta(db, req.session_id, tag_key(tag), per_tag)
            if riff.difficulty is not None and score != 0:
                apply_affinity_delta(db, req.session_id, difficulty_key(riff.difficulty), score)

        elif t in ("like", "unlike"):
            state = get_or_create_riff_state(db, req.session_id, req.riff_id)
            turning_on = (t == "like")
            if state.liked != turning_on:
                apply_toggle(db, req.session_id, riff, LIKE_WEIGHT, turning_on)
                state.liked = turning_on

        elif t in ("save", "unsave"):
            state = get_or_create_riff_state(db, req.session_id, req.riff_id)
            turning_on = (t == "save")
            if state.saved != turning_on:
                apply_toggle(db, req.session_id, riff, SAVE_WEIGHT, turning_on)
                state.saved = turning_on

    db.commit()
    return {"status": "ok"}


# -------------------------
# INTERACTIONS STATE
# -------------------------
@app.get("/interactions")
def get_interactions(session_id: str, riff_id: int, db: Session = Depends(get_db)):
    """Return the current {like, save} state for one riff, for one session —
    a direct read of SessionRiffState, kept current by POST /interact."""
    state = db.get(SessionRiffState, (session_id, riff_id))
    if state is None:
        return {"like": False, "save": False}
    return {"like": state.liked, "save": state.saved}


# -------------------------
# SAVED RIFFS
# -------------------------
@app.get("/saved-riffs")
def saved_riffs(session_id: str, db: Session = Depends(get_db)):
    """Return every riff currently saved by this session, each tagged with
    its liked/saved flags, for the Saved Riffs page. Reads SessionRiffState
    directly rather than replaying the interaction log, same as /interactions."""
    saved_states = (
        db.query(SessionRiffState)
        .filter(SessionRiffState.session_id == session_id, SessionRiffState.saved == True)
        .all()
    )
    if not saved_states:
        return []

    states_by_riff = {s.riff_id: s for s in saved_states}
    riffs = db.query(Riff).filter(Riff.id.in_(states_by_riff.keys())).all()
    result = jsonable_encoder(riffs)

    for r in result:
        s = states_by_riff.get(r["id"])
        r["liked"] = s.liked if s else False
        r["saved"] = s.saved if s else False

    return result


# -------------------------
# NEXT RIFF (RECOMMENDER)
# -------------------------
@app.get("/next-riff")
def next_riff(session_id: str, exclude: str = "", recycle: bool = False, db: Session = Depends(get_db)):
    """Return the recommender's next pick for this session.

    Excludes riffs from two sources, unioned together:
      - `exclude`: comma-separated riff IDs the client has already seen
        this page-load.
      - Server-side history: every riff_id this session has a 'view'
        Interaction row for, UNLESS `recycle=true` is passed, in which
        case server-side history is skipped and only `exclude` applies.
        This is what lets the feed loop once the library is exhausted:
        the frontend detects "no new riffs", clears its local `seen`
        set, and retries with `recycle=true` so previously-viewed riffs
        become eligible again. `exclude` is still honored during a
        recycle call so the client can protect against re-showing the
        card(s) it's currently mid-scroll on.
    """
    client_excluded = set()
    if exclude:
        try:
            client_excluded = {int(x) for x in exclude.split(",") if x}
        except ValueError:
            pass

    if recycle:
        excluded = client_excluded
    else:
        server_seen_rows = (
            db.query(Interaction.riff_id)
            .filter(Interaction.session_id == session_id, Interaction.interaction_type == "view")
            .distinct()
            .all()
        )
        server_excluded = {row[0] for row in server_seen_rows}
        excluded = client_excluded | server_excluded

    riffs = db.query(Riff).all()
    unseen = [r for r in riffs if r.id not in excluded]
    if not unseen:
        return {"message": "no new riffs"}

    affinity_rows = db.query(SessionAffinity).filter_by(session_id=session_id).all()
    if not affinity_rows:
        return jsonable_encoder(random.choice(unseen))

    tag_affinity: dict[str, float] = {}
    difficulty_affinity: dict[int, float] = {}
    for row in affinity_rows:
        if row.key.startswith("tag:"):
            tag_affinity[row.key[len("tag:"):]] = row.score
        elif row.key.startswith("difficulty:"):
            difficulty_affinity[int(row.key[len("difficulty:"):])] = row.score

    def total_score(riff: Riff) -> float:
        return content_score(riff, tag_affinity) + difficulty_score(riff, difficulty_affinity)

    scored = [(r, total_score(r)) for r in unseen]
    best = weighted_pick(scored)
    return jsonable_encoder(best)