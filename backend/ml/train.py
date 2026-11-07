"""Train a RandomForest form classifier from a labelled CSV.

Usage: python -m ml.train --csv data/sample_labelled.csv --out models/form_rf.joblib
CSV columns: see data/README.md.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

FEATURES = ["primary_angle", "torso_lean", "elbow_drift", "angle_velocity"]


def load(csv: str) -> pd.DataFrame:
    df = pd.read_csv(csv)
    missing = set(FEATURES + ["exercise", "label"]) - set(df.columns)
    if missing:
        raise ValueError(f"CSV missing columns: {sorted(missing)}")
    df = df.dropna(subset=FEATURES + ["label"])
    df["is_squat"] = (df["exercise"] == "squat").astype(int)
    return df


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--out", default="models/form_rf.joblib")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    df = load(args.csv)
    X, y = df[FEATURES + ["is_squat"]], df["label"]
    strat = y if y.value_counts().min() >= 2 else None
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=args.seed, stratify=strat)
    clf = RandomForestClassifier(n_estimators=200, random_state=args.seed, class_weight="balanced")
    clf.fit(Xtr, ytr)
    report = classification_report(yte, clf.predict(Xte), output_dict=True, zero_division=0)
    print(classification_report(yte, clf.predict(Xte), zero_division=0))

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": clf, "features": FEATURES + ["is_squat"]}, out)
    out.with_suffix(".metrics.json").write_text(json.dumps(report, indent=2))
    print(f"saved {out}")


if __name__ == "__main__":
    main()