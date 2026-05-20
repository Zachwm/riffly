from backend.database import SessionLocal
from backend.models import Riff
import json

with open("backend/data/sample_riffs.json") as f:
    riffs = json.load(f)

db = SessionLocal()

for r in riffs:
    existing = db.query(Riff).filter(Riff.id == r["id"]).first()

    if existing:
        continue

    riff = Riff(
        id=r["id"],
        title=r["title"],
        description=r["description"],
        genre=r["genre"],
        difficulty=r["difficulty"],
        bpm=r["bpm"],
        audio_url=None,
        video_url=r["video_url"],
        tags=r.get("tags", []),
        techniques=r.get("techniques", []),
        tabs=r.get("tabs", {})
    )

    db.add(riff)

db.commit()
db.close()

print("✅ Seeded riffs successfully")