from backend.core.database import SessionLocal
from backend.core.models import Riff
import json


def seed_db():
    with open("backend/data/riffs.json") as f:
        riffs = json.load(f)

    db = SessionLocal()

    for r in riffs:
        if db.query(Riff).filter(Riff.id == r["id"]).first():
            continue

        db.add(Riff(
            id=r["id"],
            title=r["title"],
            genre=r.get("genre"),
            difficulty=r.get("difficulty"),
            bpm=r.get("bpm"),
            tags=r.get("tags", []),
            events=r.get("events", [])
        ))

    db.commit()
    db.close()

    print("Seed complete")