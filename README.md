# Riffly

Riffly is a web-based personalized guitar learning platform focused on delivering short-form guitar riffs through a scrollable feed experience. The project explores how recommendation systems and interaction-driven ranking can improve engagement and learning for beginner and intermediate guitar players.

---

## Current Status

The project is currently in early MVP development.

Completed / In Progress:
- Scrollable riff feed prototype
- Structured riff metadata model
- Initial backend setup with FastAPI
- System architecture planning
- Recommendation system research

Current focus:
- Backend API development
- Database schema implementation
- Interaction tracking
- Recommendation prototype

---

## Tech Stack

- Frontend: HTML, JavaScript
- Backend: FastAPI (Python)
- Database: PostgreSQL
- Recommendation System: Content-based filtering
- Version Control: Git + GitHub

---

## Planned Features

- Infinite scrolling riff feed
- User interaction tracking
- Personalized recommendations
- Guitar tab rendering
- Difficulty and technique tagging
- Authentication system
- Recommendation scoring engine

---

# System Architecture

```mermaid
flowchart LR
    U[User] --> F[Frontend Feed UI]

    F -->|Fetch Riffs| A[FastAPI Backend]

    A --> D[(PostgreSQL Database)]

    D --> R[Riff Metadata]
    D --> I[User Interactions]

    R --> S[Recommendation Scoring]
    I --> S

    S --> A

    subgraph Riff Data
        T1[Tags]
        T2[Techniques]
        T3[Difficulty]
        T4[Genre]
        T5[BPM]
        T6[Tabs]
    end

    R --> T1
    R --> T2
    R --> T3
    R --> T4
    R --> T5
    R --> T6
```

---

# User Interaction Flow

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

# Database Structure

```mermaid
erDiagram
    USERS {
        int id
        string username
        string skill_level
    }

    RIFFS {
        int id
        string title
        string genre
        int difficulty
        int bpm
    }

    INTERACTIONS {
        int id
        int user_id
        int riff_id
        string interaction_type
    }

    USERS ||--o{ INTERACTIONS : creates
    RIFFS ||--o{ INTERACTIONS : receives
```

---

# Development Timeline

```mermaid
gantt
    title Riffly MVP Development Timeline
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d

    section Planning
    Project Planning & Research        :done, p1, 2026-04-20, 7d
    Tutorials / Dataset Gathering     :done, p2, 2026-04-27, 7d
    System Design & Flow Diagrams     :active, p3, 2026-05-04, 7d

    section Core Backend
    FastAPI Backend Prototype         :active, p4, 2026-05-11, 7d
    Recommendation Logic Prototype    :p5, 2026-05-18, 7d
    Scope & Feasibility Evaluation    :p6, 2026-05-18, 4d

    section Documentation
    Software Requirements Spec (SRS) :p7, 2026-05-25, 7d

    section Backend Systems
    Final Database Schema             :p8, 2026-06-01, 7d
    Full Backend API                  :p9, 2026-06-08, 14d
    User Authentication               :p10, 2026-06-15, 7d
    Interaction Tracking              :p11, 2026-06-22, 7d

    section Frontend
    Functional Feed UI                :active, p12, 2026-06-29, 7d

    section Finalization
    Recommendation System Complete    :p13, 2026-07-06, 7d
    Final Demo Prep                   :p14, 2026-07-13, 7d

    todayMarker stroke-width:4px,stroke:#ff0000,opacity:0.7
```

---

# Example Riff Data Structure

```json
{
  "id": 1,
  "title": "Blues Riff in A Minor",
  "description": "Simple minor blues riff using hammer-ons and a pentatonic shape.",
  "video_url": "https://example.com/videos/riff1.mp4",
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
