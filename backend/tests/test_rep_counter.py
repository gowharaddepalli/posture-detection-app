import math

import pytest

from app.rep_counter import RepCounter


def feed(c, seq):
    for a in seq:
        c.update(a)
    return c.reps


def test_one_squat_rep():
    assert feed(RepCounter.for_exercise("squat"), [170, 120, 80, 120, 170]) == 1


def test_shallow_squat_not_counted():
    assert feed(RepCounter.for_exercise("squat"), [170, 110, 95, 170]) == 0


def test_hysteresis_ignores_jitter():
    assert feed(RepCounter.for_exercise("bicep_curl"), [160, 40, 50, 40, 60, 40, 155]) == 1


def test_three_curls():
    assert feed(RepCounter.for_exercise("bicep_curl"), [160, 30, 160] * 3) == 3


def test_nan_ignored():
    assert feed(RepCounter.for_exercise("squat"), [170, math.nan, 80, math.nan, 170]) == 1


def test_invalid_thresholds():
    with pytest.raises(ValueError):
        RepCounter(flexed=150, extended=100)


def test_unknown_exercise():
    with pytest.raises(ValueError):
        RepCounter.for_exercise("pushup")