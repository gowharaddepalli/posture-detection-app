"""OpenCV + MediaPipe helpers for offline video processing.

Imports of cv2/mediapipe are lazy so the API and tests run without them installed.
"""
from __future__ import annotations

from typing import Iterator, Optional

from .angles import angle_from_vertical, joint_angle
from .rep_counter import RepCounter

# MediaPipe Pose landmark indices
L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANKLE, R_ANKLE = 27, 28

CHAINS = {
    "squat": ((L_HIP, L_KNEE, L_ANKLE), (R_HIP, R_KNEE, R_ANKLE)),
    "bicep_curl": ((L_SHOULDER, L_ELBOW, L_WRIST), (R_SHOULDER, R_ELBOW, R_WRIST)),
}


def pick_side(exercise: str, landmarks: list[tuple[float, float, float]]) -> Optional[tuple[int, int, int]]:
    """Choose the more visible body side; None if neither is visible enough."""
    left, right = CHAINS[exercise]
    score = lambda ids: sum(landmarks[i][2] for i in ids)
    best = left if score(left) >= score(right) else right
    return best if score(best) >= 1.5 else None


def primary_angle(exercise: str, landmarks: list[tuple[float, float, float]]) -> Optional[float]:
    chain = pick_side(exercise, landmarks)
    if chain is None:
        return None
    a, b, c = (landmarks[i] for i in chain)
    return joint_angle(a, b, c)


def form_feedback(exercise: str, landmarks: list[tuple[float, float, float]], phase: str) -> str:
    chain = pick_side(exercise, landmarks)
    if chain is None:
        return "Body not fully visible"
    left = chain[0] in (L_HIP, L_SHOULDER)
    if exercise == "squat":
        hip, sh = landmarks[L_HIP if left else R_HIP], landmarks[L_SHOULDER if left else R_SHOULDER]
        if angle_from_vertical(hip, sh) > 45:
            return "Keep your chest up"
        return "Good depth" if phase == "flexed" else "Good posture"
    sh, el = landmarks[L_SHOULDER if left else R_SHOULDER], landmarks[L_ELBOW if left else R_ELBOW]
    if angle_from_vertical(sh, el) > 25:
        return "Keep your elbow pinned"
    return "Good form"


def iter_video_landmarks(path: str) -> Iterator[list[tuple[float, float, float]]]:
    """Yield normalized (x, y, visibility) landmarks per frame using MediaPipe Pose."""
    import cv2  # type: ignore
    import mediapipe as mp  # type: ignore

    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise FileNotFoundError(f"cannot open video: {path}")
    with mp.solutions.pose.Pose(model_complexity=1) as pose:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            res = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            if res.pose_landmarks:
                yield [(p.x, p.y, p.visibility) for p in res.pose_landmarks.landmark]
    cap.release()


def count_reps_in_video(path: str, exercise: str) -> dict:
    counter = RepCounter.for_exercise(exercise)
    frames = 0
    for lm in iter_video_landmarks(path):
        frames += 1
        angle = primary_angle(exercise, lm)
        if angle is not None:
            counter.update(angle)
    return {"exercise": exercise, "reps": counter.reps, "frames_with_pose": frames}