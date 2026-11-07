"""Evaluate a trained model on a held-out labelled CSV.

Usage: python -m ml.evaluate --model models/form_rf.joblib --csv data/test.csv
"""
from __future__ import annotations

import argparse

import joblib
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

from ml.train import load


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--csv", required=True)
    args = ap.parse_args()

    bundle = joblib.load(args.model)
    df = load(args.csv)
    pred = bundle["model"].predict(df[bundle["features"]])
    print(f"accuracy: {accuracy_score(df['label'], pred):.3f}")
    print(classification_report(df["label"], pred, zero_division=0))
    print("confusion matrix:\n", confusion_matrix(df["label"], pred))


if __name__ == "__main__":
    main()