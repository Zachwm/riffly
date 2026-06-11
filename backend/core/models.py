from sqlalchemy import Column, Integer, String, Text, DateTime
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
    techniques = Column(JSONB, default=list)

    tabs = Column(JSONB)

    events = Column(JSONB)

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