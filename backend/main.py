from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import Riff, Interaction

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------
# DB Dependency
# -------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -------------------------
# GET RIFFS
# -------------------------
@app.get("/riffs")
def get_riffs(db: Session = Depends(get_db)):
    return db.query(Riff).all()


class InteractionRequest(BaseModel):
    riff_id: int
    interaction_type: str
    duration_ms: int | None = None
    session_id: str


# -------------------------
# ADD INTERACTION
# -------------------------
@app.post("/interact")
def add_interaction(req: InteractionRequest, db: Session = Depends(get_db)):

    interaction = Interaction(
        user_id=1,
        session_id=req.session_id,
        riff_id=req.riff_id,
        interaction_type=req.interaction_type,
        duration_ms=req.duration_ms
    )

    db.add(interaction)
    db.commit()

    return {"status": "ok"}


# -------------------------
# NEXT RIFF (RECOMMENDER)
# -------------------------
@app.get("/next-riff")
def next_riff(session_id: str, db: Session = Depends(get_db)):

    riffs = db.query(Riff).all()

    interactions = db.query(Interaction).filter(
        Interaction.session_id == session_id
    ).all()

    scores = {r.id: 0 for r in riffs}

    # -------------------------
    # 1. LIKED GENRES
    # -------------------------
    liked_genres = {
        r.genre
        for i in interactions
        for r in riffs
        if i.riff_id == r.id
        and (i.interaction_type or "").strip().lower() == "like"
    }

    # -------------------------
    # 2. GENRE BOOST
    # -------------------------
    for r in riffs:
        if r.genre in liked_genres:
            scores[r.id] += 0.5

    # -------------------------
    # 3. DIRECT INTERACTIONS
    # -------------------------
    for i in interactions:
        t = (i.interaction_type or "").strip().lower()

        if t == "view":
            scores[i.riff_id] += 0.1

        elif t == "like":
            scores[i.riff_id] += 3

    # -------------------------
    # 4. REMOVE SEEN
    # -------------------------
    seen_ids = {i.riff_id for i in interactions}
    unseen = [r for r in riffs if r.id not in seen_ids]

    if not unseen:
        return {"message": "no new riffs"}

    # -------------------------
    # 5. RANK
    # -------------------------
    return max(unseen, key=lambda r: scores.get(r.id, 0))