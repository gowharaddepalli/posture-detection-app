"""Finite-state rep counter with hysteresis. Mirrors RepCounter in src/lib/pose.ts."""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal

Exercise = Literal["squat", "bicep_curl"]

THRESHOLDS: dict[str, tuple[float, float]] = {
    # (flexed, extended) in degrees
    "squat": (90.0, 160.0),
    "bicep_curl": (45.0, 150.0),
}


@dataclass
class RepCounter:
    flexed: float
    extended: float
    reps: int = 0
    phase: Literal["extended", "flexed"] = "extended"
    min_angle_this_rep: float = field(default=180.0)

    def __post_init__(self) -> None:
        if self.flexed >= self.extended:
            raise ValueError("flexed threshold must be below extended threshold")

    @classmethod
    def for_exercise(cls, exercise: str) -> "RepCounter":
        if exercise not in THRESHOLDS:
            raise ValueError(f"unknown exercise: {exercise}")
        f, e = THRESHOLDS[exercise]
        return cls(flexed=f, extended=e)

    def update(self, angle: float) -> bool:
        """Feed one angle sample; returns True when a rep is completed."""
        if angle is None or not math.isfinite(angle):
            return False
        self.min_angle_this_rep = min(self.min_angle_this_rep, angle)
        if self.phase == "extended" and angle <= self.flexed:
            self.phase = "flexed"
            return False
        if self.phase == "flexed" and angle >= self.extended:
            self.phase = "extended"
            self.reps += 1
            self.min_angle_this_rep = 180.0
            return True
        return False

    def reset(self) -> None:
        self.reps = 0
        self.phase = "extended"
        self.min_angle_this_rep = 180.0