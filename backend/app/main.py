"""FastAPI service: health, angle analysis, and session storage."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .angles import joint_angle
from .rep_counter import RepCounter

app = FastAPI(title="Posture Detection & Rep Counter API", version="1.0.0")

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:8080").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

Exercise = Literal["squat", "bicep_curl"]


class Point(BaseModel):
    x: float
    y: float


class AngleRequest(BaseModel):
    a: Point
    b: Point
    c: Point


class CountRequest(BaseModel):
    exercise: Exercise
    angles: list[float] = Field(..., min_length=1, max_length=100_000)


class SessionIn(BaseModel):
    exercise: Exercise
    reps: int = Field(..., ge=0)
    duration_sec: float = Field(..., ge=0)
    warnings: int = Field(0, ge=0)
    mode: Literal["live", "simulated"]
    started_at: Optional[datetime] = None


class Session(SessionIn):
    id: str
    started_at: datetime


# In-memory store. Swap for a database in production (see README).
SESSIONS: dict[str, Session] = {}


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


@app.post("/angle")
def angle(req: AngleRequest) -> dict:
    return {"angle": joint_angle((req.a.x, req.a.y), (req.b.x, req.b.y), (req.c.x, req.c.y))}


@app.post("/count")
def count(req: CountRequest) -> dict:
    c = RepCounter.for_exercise(req.exercise)
    for a in req.angles:
        c.update(a)
    return {"exercise": req.exercise, "reps": c.reps, "final_phase": c.phase}


@app.post("/sessions", status_code=201)
def create_session(body: SessionIn) -> Session:
    s = Session(
        id=str(uuid.uuid4()),
        **body.model_dump(exclude={"started_at"}),
        started_at=body.started_at or datetime.now(timezone.utc),
    )
    SESSIONS[s.id] = s
    return s


@app.get("/sessions")
def list_sessions() -> list[Session]:
    return sorted(SESSIONS.values(), key=lambda s: s.started_at, reverse=True)


@app.get("/sessions/{sid}")
def get_session(sid: str) -> Session:
    if sid not in SESSIONS:
        raise HTTPException(404, "session not found")
    return SESSIONS[sid]


@app.delete("/sessions/{sid}", status_code=204)
def delete_session(sid: str) -> None:
    if SESSIONS.pop(sid, None) is None:
        raise HTTPException(404, "session not found")


@app.get("/sessions-summary")
def summary() -> dict:
    out: dict[str, dict] = {}
    for s in SESSIONS.values():
        d = out.setdefault(s.exercise, {"sessions": 0, "reps": 0, "duration_sec": 0.0})
        d["sessions"] += 1
        d["reps"] += s.reps
        d["duration_sec"] += s.duration_sec
    return out