from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from .database import Base


class Riff(Base):
    __tablename__ = "riffs"

    # -------------------
    # Identity
    # -------------------
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text)

    # -------------------
    # Core ranking signals
    # -------------------
    genre = Column(String, index=True)
    difficulty = Column(Integer, index=True)
    bpm = Column(Integer)

    # -------------------
    # Media (keep simple for MVP)
    # -------------------
    audio_url = Column(String)
    video_url = Column(String)

    # -------------------
    # Recommendation features
    # -------------------
    tags = Column(JSONB, default=list)          # ["blues", "beginner"]
    techniques = Column(JSONB, default=list)    # ["hammer-on", "slide"]

    # -------------------
    # Learning content
    # -------------------
    tabs = Column(JSONB)

    # -------------------
    # System
    # -------------------
    created_at = Column(DateTime, default=datetime.utcnow)


class Interaction(Base):
    __tablename__ = "interactions"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, default=1)
    session_id = Column(String, index=True)

    riff_id = Column(Integer, index=True)
    interaction_type = Column(String)

    duration_ms = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)