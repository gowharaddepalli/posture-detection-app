// Pure, framework-free posture logic. Mirrors backend/app/angles.py and rep_counter.py.

export type Point = { x: number; y: number; visibility?: number };
export type Exercise = "squat" | "bicep_curl";

/** Angle at vertex b (degrees, 0–180) formed by a-b-c. */
export function jointAngle(a: Point, b: Point, c: Point): number {
  const r = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let deg = Math.abs((r * 180) / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return deg;
}

/** Angle (degrees) between segment a->b and the vertical axis. */
export function angleFromVertical(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return 0;
  return (Math.abs(Math.atan2(dx, dy)) * 180) / Math.PI > 90
    ? 180 - (Math.abs(Math.atan2(dx, dy)) * 180) / Math.PI
    : (Math.abs(Math.atan2(dx, dy)) * 180) / Math.PI;
}

export const THRESHOLDS: Record<Exercise, { flexed: number; extended: number }> = {
  squat: { flexed: 90, extended: 160 },
  bicep_curl: { flexed: 45, extended: 150 },
};

export type RepPhase = "extended" | "flexed";

/** Finite-state rep counter: extended -> flexed -> extended counts one rep. Hysteresis avoids jitter. */
export class RepCounter {
  reps = 0;
  phase: RepPhase = "extended";
  minAngleThisRep = 180;
  constructor(
    public flexed: number,
    public extended: number,
  ) {
    if (flexed >= extended) throw new Error("flexed threshold must be below extended threshold");
  }
  static for(ex: Exercise) {
    const t = THRESHOLDS[ex];
    return new RepCounter(t.flexed, t.extended);
  }
  /** Feed one angle sample. Returns true when a rep was just completed. */
  update(angle: number): boolean {
    if (!Number.isFinite(angle)) return false;
    this.minAngleThisRep = Math.min(this.minAngleThisRep, angle);
    if (this.phase === "extended" && angle <= this.flexed) {
      this.phase = "flexed";
      return false;
    }
    if (this.phase === "flexed" && angle >= this.extended) {
      this.phase = "extended";
      this.reps += 1;
      this.minAngleThisRep = 180;
      return true;
    }
    return false;
  }
  reset() {
    this.reps = 0;
    this.phase = "extended";
    this.minAngleThisRep = 180;
  }
}

// MediaPipe Pose landmark indices
export const LM = {
  L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14, L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26, L_ANKLE: 27, R_ANKLE: 28,
} as const;

export type Analysis = {
  angle: number | null;
  feedback: string;
  level: "good" | "warn" | "idle";
  side: "left" | "right";
};

const vis = (p?: Point) => p?.visibility ?? 0;

export function analyze(ex: Exercise, lm: Point[], phase: RepPhase): Analysis {
  const leftScore = ex === "squat"
    ? vis(lm[LM.L_HIP]) + vis(lm[LM.L_KNEE]) + vis(lm[LM.L_ANKLE])
    : vis(lm[LM.L_SHOULDER]) + vis(lm[LM.L_ELBOW]) + vis(lm[LM.L_WRIST]);
  const rightScore = ex === "squat"
    ? vis(lm[LM.R_HIP]) + vis(lm[LM.R_KNEE]) + vis(lm[LM.R_ANKLE])
    : vis(lm[LM.R_SHOULDER]) + vis(lm[LM.R_ELBOW]) + vis(lm[LM.R_WRIST]);
  const side = leftScore >= rightScore ? "left" : "right";
  const best = Math.max(leftScore, rightScore);
  if (best < 1.5) {
    return { angle: null, feedback: ex === "squat" ? "Step back so hips, knees and ankles are visible" : "Turn side-on so shoulder, elbow and wrist are visible", level: "idle", side };
  }
  const L = side === "left";
  const sh = lm[L ? LM.L_SHOULDER : LM.R_SHOULDER];
  const el = lm[L ? LM.L_ELBOW : LM.R_ELBOW];
  const wr = lm[L ? LM.L_WRIST : LM.R_WRIST];
  const hip = lm[L ? LM.L_HIP : LM.R_HIP];
  const kn = lm[L ? LM.L_KNEE : LM.R_KNEE];
  const an = lm[L ? LM.L_ANKLE : LM.R_ANKLE];

  if (ex === "squat") {
    const angle = jointAngle(hip, kn, an);
    const lean = angleFromVertical(hip, sh);
    if (lean > 45) return { angle, feedback: "Keep your chest up — torso leaning too far forward", level: "warn", side };
    if (phase === "extended" && angle < 140 && angle > THRESHOLDS.squat.flexed) return { angle, feedback: "Go lower — aim for thighs parallel", level: "warn", side };
    if (phase === "flexed") return { angle, feedback: "Good depth — drive up", level: "good", side };
    return { angle, feedback: "Good posture — begin squat", level: "good", side };
  }
  const angle = jointAngle(sh, el, wr);
  const drift = angleFromVertical(sh, el);
  if (drift > 25) return { angle, feedback: "Keep your elbow pinned to your side", level: "warn", side };
  if (phase === "flexed") return { angle, feedback: "Full contraction — lower slowly", level: "good", side };
  return { angle, feedback: "Good form — curl up", level: "good", side };
}

export type SessionRecord = {
  id: string;
  exercise: Exercise;
  reps: number;
  durationSec: number;
  startedAt: string;
  mode: "live" | "simulated";
  warnings: number;
};

export function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}