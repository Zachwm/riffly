# Riffly

Riffly is a web-based personalized guitar learning platform focused on delivering short-form guitar riffs through a scrollable feed experience. The project explores how content-based recommendation systems and interaction-driven ranking can improve engagement and learning for beginner and intermediate guitar players.

---

## Current Status

The project is currently in early MVP development.

### Completed / In Progress
- Scrollable riff feed prototype
- Structured riff metadata model
- Initial backend setup with FastAPI
- System architecture planning
- Recommendation system research

### Current Focus
- Backend API development
- Database schema implementation
- Interaction tracking system
- Recommendation system prototype

---

## Tech Stack

- **Frontend:** HTML, JavaScript  
- **Backend:** FastAPI (Python)  
- **Database:** PostgreSQL
- **Recommendation System:** Content-based filtering (MVP; extensible to hybrid or learning-to-rank models)
- **Version Control:** Git + GitHub

## Project Goal

To explore how real-time interaction signals can be used to drive personalized learning in a short-form, feed-based educational system.

---

## Planned Features

- Infinite scrolling riff feed
- User interaction tracking (likes, skips, favorites, completions)
- Personalized recommendations
- Automatic audio preview playback while scrolling
- Guitar tab rendering
- Difficulty and technique tagging
- Authentication system
- Recommendation scoring engine

---

## System Architecture

```mermaid
flowchart LR
    U[User] --> F[Frontend Feed UI]

    F -->|Fetch Riffs| A[FastAPI Backend]

    A --> D[(PostgreSQL Database)]

    D --> R[Riff Metadata]
    D --> I[User Interactions]

    R --> S[Recommendation Scoring Engine]
    I --> S

    S --> A
```

---

## Riff Data Model

Each riff represents a short guitar learning snippet containing audio, optional video, and structured musical metadata.

### Core Riff Structure
```json
{
  "id": 1,
  "title": "Blues Riff in A Minor",
  "description": "Simple minor blues riff using hammer-ons and a pentatonic shape.",
  "media": {
    "audio_url": "https://example.com/audio/riff1.mp3",
    "video_url": "https://example.com/videos/riff1.mp4"
  },
  "difficulty": 2,
  "bpm": 90,
  "genre": "blues",
  "tags": ["blues", "beginner", "minor"],
  "techniques": ["hammer-on"],
  "tabs": {
    "e": "----------------|",
    "B": "----------------|",
    "G": "-----5h7--5-----|",
    "D": "--7-------------|",
    "A": "----------------|",
    "E": "----------------|"
  }
}
```

---

## Database Design

The database supports a feed-based recommendation system driven by user interactions.

### Core Tables
```mermaid
erDiagram
    USERS {
        int id
        string username
        string skill_level
        timestamp created_at
    }

    RIFFS {
        int id
        string title
        string genre
        int difficulty
        int bpm
        string audio_url
        string video_url
        timestamp created_at
    }

    INTERACTIONS {
        int id
        int user_id
        int riff_id
        string interaction_type
        int duration_ms
        timestamp created_at
    }

    RIFF_TAGS {
        int riff_id
        string tag
    }

    RIFF_TECHNIQUES {
        int riff_id
        string technique
    }

    USERS ||--o{ INTERACTIONS : creates
    RIFFS ||--o{ INTERACTIONS : receives
    RIFFS ||--o{ RIFF_TAGS : has
    RIFFS ||--o{ RIFF_TECHNIQUES : includes
```

---

## Data Model Philosophy

The system is designed around a feed-based recommendation model where user behavior is more important than explicit ratings.

Instead of relying on star ratings or manual feedback, the system uses implicit signals such as:

- Interaction type (like, skip, complete)
- Engagement duration (time spent on a riff)
- Content similarity (tags, techniques, genre overlap)

This allows the recommendation system to evolve from simple content filtering into behavior-driven ranking over time.

---

## Recommendation System

The MVP recommendation system uses a content-based scoring approach that ranks riffs based on similarity to previously engaged content.

### Ranking Signals

#### Content Features

- Genre similarity
- Technique overlap (e.g., hammer-ons, bends, slides)
- Difficulty proximity
- Tag matching

#### User Behavior Signals

- Likes (positive signal)
- Skips (negative signal)
- Completions (strong positive signal)
- Time spent on riff (implicit engagement weight)

### MVP Scoring Approach

Riffs are ranked using a weighted scoring function combining:

- Content similarity to previously engaged riffs
- Recency bias
- Engagement strength from interaction history

This system is designed to evolve into a hybrid or learning-to-rank model in future iterations.

## User Interaction Flow

### Interaction Flow Diagram
```mermaid
flowchart TD
    A[Open Feed] --> B[View Riff]
    B --> C{User Action}

    C -->|Like| D[Store Positive Interaction]
    C -->|Skip| E[Store Negative Interaction]
    C -->|Complete| F[Store Completion]

    D --> G[Update Recommendation Scores]
    E --> G
    F --> G

    G --> H[Generate Personalized Feed]
```

---

## Development Timeline

```mermaid
gantt
    title Riffly MVP Development Timeline
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d

    section Planning
    Project Planning & Research        :done, p1, 2026-04-20, 7d
    Tutorials / Dataset Gathering       :done, p2, 2026-04-27, 7d
    System Design & Flow Diagrams       :active, p3, 2026-05-04, 7d

    section Core Backend
    FastAPI Backend Prototype           :active, p4, 2026-05-11, 7d
    Recommendation Logic Prototype      :p5, 2026-05-18, 7d
    Scope & Feasibility Evaluation      :p6, 2026-05-18, 4d

    section Documentation
    Software Requirements Spec (SRS)    :p7, 2026-05-25, 7d

    section Backend Systems
    Final Database Schema               :p8, 2026-06-01, 7d
    Full Backend API                    :p9, 2026-06-08, 14d
    User Authentication                 :p10, 2026-06-15, 7d
    Interaction Tracking                :p11, 2026-06-22, 7d

    section Frontend
    Functional Feed UI                  :active, p12, 2026-06-29, 7d

    section Finalization
    Recommendation System Complete       :p13, 2026-07-06, 7d
    Final Demo Prep                     :p14, 2026-07-13, 7d

    todayMarker stroke-width:4px,stroke:#ff0000,opacity:0.7
```

---

# Running the Project

## 1. Clone the Repository

```bash
git clone <repo-url>
```

## 2. Start the Backend

```bash
cd backend
uvicorn main:app --reload
```

Run this command from the directory containing `main.py`.

## 3. Open the Frontend

Open `index.html` directly in your browser.

---

# Author

Zachary McLaughlin
