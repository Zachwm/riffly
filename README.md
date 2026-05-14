# Riffly

Riffly is a web-based project where I am building a personalized guitar learning platform. The goal is to deliver short-form guitar riffs to users and explore how recommendation systems can improve engagement and learning.

## Current Status

This project is in the early development phase. Current work is focused on:

* Researching recommendation systems
* Designing data models
* Building small backend prototypes

## Planned Components

* Backend API (FastAPI)
* Database for riffs, users, and interactions
* Basic recommendation system (content-based)
* Simple frontend for displaying a riff feed

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
    FastAPI Backend Prototype         :p4, 2026-05-11, 7d
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
    Functional Feed UI                :p12, 2026-06-29, 7d

    section Finalization
    Recommendation System Complete    :p13, 2026-07-06, 7d
    Final Demo Prep                   :p14, 2026-07-13, 7d

    todayMarker stroke-width:4px,stroke:#ff0000,opacity:0.7
```

## Running the Project

#### 1. Clone the repository
```
git clone <repo-url>
```
```
cd backend
```
#### 2. Start the backend server
```
uvicorn main:app --reload
```
Make sure you run this from the directory where main.py is located.  

#### 3. Open the frontend

Open index.html directly in your browser.

## Author

Zachary McLaughlin
