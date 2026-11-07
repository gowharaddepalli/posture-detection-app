import pytest

from app.angles import angle_from_vertical, joint_angle


def test_right_angle():
    assert joint_angle((1, 0), (0, 0), (0, 1)) == pytest.approx(90)


def test_straight_line():
    assert joint_angle((-1, 0), (0, 0), (1, 0)) == pytest.approx(180)


def test_diagonal():
    assert joint_angle((1, 0), (0, 0), (1, 1)) == pytest.approx(45)


def test_vertical_segment_zero_deviation():
    assert angle_from_vertical((0, 1), (0, 0)) == pytest.approx(0)


def test_horizontal_segment_ninety_deviation():
    assert angle_from_vertical((0, 0), (1, 0)) == pytest.approx(90)