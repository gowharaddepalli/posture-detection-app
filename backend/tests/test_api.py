from fastapi.testclient import TestClient

from app.main import SESSIONS, app

client = TestClient(app)


def setup_function():
    SESSIONS.clear()


def test_health():
    assert client.get("/health").json()["status"] == "ok"


def test_angle():
    r = client.post("/angle", json={"a": {"x": 1, "y": 0}, "b": {"x": 0, "y": 0}, "c": {"x": 0, "y": 1}})
    assert round(r.json()["angle"]) == 90


def test_count():
    r = client.post("/count", json={"exercise": "squat", "angles": [170, 80, 170, 80, 170]})
    assert r.json()["reps"] == 2


def test_session_crud_and_summary():
    body = {"exercise": "bicep_curl", "reps": 10, "duration_sec": 42, "mode": "live"}
    r = client.post("/sessions", json=body)
    assert r.status_code == 201
    sid = r.json()["id"]
    assert client.get(f"/sessions/{sid}").json()["reps"] == 10
    assert len(client.get("/sessions").json()) == 1
    assert client.get("/sessions-summary").json()["bicep_curl"]["reps"] == 10
    assert client.delete(f"/sessions/{sid}").status_code == 204
    assert client.get(f"/sessions/{sid}").status_code == 404


def test_rejects_negative_reps():
    r = client.post("/sessions", json={"exercise": "squat", "reps": -1, "duration_sec": 1, "mode": "live"})
    assert r.status_code == 422