# Real-Time Posture Detection and Rep Counter

A browser-based fitness project for estimating exercise posture and counting repetitions, supported by Python pose utilities and a FastAPI backend.

## Features
- Webcam-based pose landmark detection in the browser.
- Exercise workflow with repetition counting and form feedback.
- Squat/curl-oriented rep-counting logic and angle utilities.
- FastAPI endpoints and Python pose-processing helpers.
- Optional machine-learning training/evaluation utilities.
- Sample labelled data and automated tests.

## Tech stack
React, TypeScript, Vite, MediaPipe, Python, FastAPI, OpenCV, NumPy, scikit-learn.

## Project structure
- `src/` — frontend dashboard, pose hook, and pose utilities.
- `backend/app/` — API, pose utilities, angle calculations, and rep counter.
- `backend/ml/` — model training and evaluation scripts.
- `backend/data/` — sample labelled data.
- `backend/tests/` — backend tests.

## Getting started
### Frontend
```bash
bun install
bun run dev
```

Use a modern browser and grant camera permission. Camera access generally requires HTTPS or localhost.

### Backend
```bash
cd backend
python -m venv .venv
# Activate the virtual environment, then:
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Review `backend/.env.example` for optional configuration.

## Tests
Frontend:
```bash
bunx vitest run
```
Backend:
```bash
cd backend
pytest
```

## Limitations and privacy
Pose estimation is an approximation and can be affected by camera placement, lighting, occlusion, and individual movement patterns. This project is for fitness assistance and educational use, not medical diagnosis. Obtain consent before recording or processing anyone's camera feed.

## License
MIT. See [LICENSE](LICENSE).
