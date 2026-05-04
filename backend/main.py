from fastapi import FastAPI
from pydantic import BaseModel
import json
from fastapi.middleware.cors import CORSMiddleware
import random

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allows all frontend origins (dev only)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# load fake data
def load_riffs():
    with open("data/sample_riffs.json") as f:
        return json.load(f)

# ---- 1. GET RIFFS ----
@app.get("/riffs")
def get_riffs():
    return load_riffs()


# ---- 2. LIKE RIFF ----
class LikeRequest(BaseModel):
    riff_id: int

likes = []

@app.post("/like")
def like_riff(request: LikeRequest):
    likes.append(request.riff_id)
    return {"message": "liked", "likes": likes}

@app.get("/next-riff")
def next_riff():
    riffs = load_riffs()

    # TEMP recommendation logic (simple version)
    return random.choice(riffs)