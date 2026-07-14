from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from .database import Base


class Riff(Base):
    __tablename__ = "riffs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)

    genre = Column(String, index=True)
    difficulty = Column(Integer, index=True)
    bpm = Column(Integer)

    audio_url = Column(String)

    tags = Column(JSONB, default=list)
    events = Column(JSONB)

    created_at = Column(DateTime, default=datetime.utcnow)


class Interaction(Base):
    """Append-only event log — kept as the audit trail even after
    SessionAffinity takes over as the fast read path. If LIKE_WEIGHT,
    SKIP_PIVOT, etc. ever change, this is what you'd replay to rebuild
    SessionAffinity under the new weights."""
    __tablename__ = "interactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=1)
    session_id = Column(String, index=True)
    riff_id = Column(Integer, index=True)
    interaction_type = Column(String)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SessionAffinity(Base):
    """Incrementally-updated affinity score per session per tag/difficulty
    key, e.g. "tag:blues" -> 5.5, "difficulty:3" -> 4.0. Score is RAW —
    DIFFICULTY_WEIGHT is applied at read time (see difficulty_score in
    main.py), so it stays tunable without a data migration."""
    __tablename__ = "session_affinity"

    session_id = Column(String, primary_key=True)
    key = Column(String, primary_key=True)
    score = Column(Float, nullable=False, default=0.0)


class SessionRiffState(Base):
    """Current like/save state per (session, riff) — needed to compute the
    correct delta on toggle (like->unlike->like shouldn't double-count),
    and is now also the single source of truth for GET /interactions."""
    __tablename__ = "session_riff_state"

    session_id = Column(String, primary_key=True)
    riff_id = Column(Integer, primary_key=True)
    liked = Column(Boolean, nullable=False, default=False)
    saved = Column(Boolean, nullable=False, default=False)