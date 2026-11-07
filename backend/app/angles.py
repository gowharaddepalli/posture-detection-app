"""Joint-angle geometry. Mirrors src/lib/pose.ts on the frontend."""
from __future__ import annotations

import math
from typing import Sequence

Point = Sequence[float]  # (x, y) or (x, y, visibility)


def joint_angle(a: Point, b: Point, c: Point) -> float:
    """Angle at vertex b (degrees, 0-180) formed by a-b-c."""
    r = math.atan2(c[1] - b[1], c[0] - b[0]) - math.atan2(a[1] - b[1], a[0] - b[0])
    deg = abs(math.degrees(r))
    return 360.0 - deg if deg > 180.0 else deg


def angle_from_vertical(a: Point, b: Point) -> float:
    """Deviation (degrees, 0-90) of segment a->b from the vertical axis."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    if dx == 0 and dy == 0:
        return 0.0
    deg = abs(math.degrees(math.atan2(dx, dy)))
    return 180.0 - deg if deg > 90.0 else deg