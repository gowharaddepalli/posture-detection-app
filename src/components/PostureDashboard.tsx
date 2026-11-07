import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Play, Square, AlertTriangle, FlaskConical, Activity, Timer, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  analyze, formatTime, RepCounter, THRESHOLDS,
  type Analysis, type Exercise, type SessionRecord, type Point,
} from "@/lib/pose";
import { checkBrowserSupport, usePoseLandmarker } from "@/hooks/use-pose-landmarker";

type Mode = "live" | "simulated";
type CamState = "off" | "requesting" | "on" | "denied" | "error";
const HISTORY_KEY = "posture-sessions-v1";
const EX_LABEL: Record<Exercise, string> = { squat: "Squat", bicep_curl: "Bicep curl" };

export function PostureDashboard() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const counterRef = useRef(RepCounter.for("squat"));
  const warnRef = useRef({ count: 0, last: "" });
  const startRef = useRef<number | null>(null);

  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("live");
  const [exercise, setExercise] = useState<Exercise>("squat");
  const [cam, setCam] = useState<CamState>("off");
  const [camError, setCamError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [reps, setReps] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState<SessionRecord[]>([]);
  const [lastSummary, setLastSummary] = useState<SessionRecord | null>(null);
  const [simAngle, setSimAngle] = useState(170);
  const [simAuto, setSimAuto] = useState(true);
  const [fps, setFps] = useState(0);
  const { landmarker, load, status: modelStatus, error: modelError } = usePoseLandmarker();

  useEffect(() => {
    const reason = checkBrowserSupport();
    setUnsupported(reason);
    if (reason) setMode("simulated");
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch { /* ignore corrupt storage */ }
  }, []);

  const persist = (h: SessionRecord[]) => {
    setHistory(h);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch { /* quota */ }
  };

  // Session timer
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (startRef.current) setElapsed((performance.now() - startRef.current) / 1000);
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCam("off");
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = async () => {
    setCamError(null);
    setCam("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setCam("on");
      void load();
    } catch (e) {
      const err = e as DOMException;
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        setCam("denied");
        setCamError("Camera permission was blocked. Allow camera access in your browser's site settings, then try again.");
      } else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
        setCam("error");
        setCamError("No camera was found on this device.");
      } else if (err.name === "NotReadableError") {
        setCam("error");
        setCamError("Your camera is in use by another app. Close it and try again.");
      } else {
        setCam("error");
        setCamError(err.message || "Could not start the camera.");
      }
    }
  };

  // Live detection loop
  useEffect(() => {
    if (mode !== "live" || cam !== "on" || modelStatus !== "ready") return;
    let lastTs = -1;
    let frames = 0;
    let fpsT = performance.now();
    const loop = async () => {
      const v = videoRef.current, c = canvasRef.current, lm = landmarker.current;
      if (!v || !c || !lm) return;
      if (v.readyState >= 2 && v.currentTime !== lastTs) {
        lastTs = v.currentTime;
        if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
        const ctx = c.getContext("2d")!;
        const res = lm.detectForVideo(v, performance.now());
        ctx.clearRect(0, 0, c.width, c.height);
        const pose = res.landmarks[0];
        if (pose) {
          const { DrawingUtils, PoseLandmarker } = await import("@mediapipe/tasks-vision");
          const du = new DrawingUtils(ctx);
          const styles = getComputedStyle(document.documentElement);
          du.drawConnectors(pose, PoseLandmarker.POSE_CONNECTIONS, { color: styles.getPropertyValue("--primary"), lineWidth: 4 });
          du.drawLandmarks(pose, { color: styles.getPropertyValue("--simulated"), radius: 4 });
          handleSample(analyze(exerciseRef.current, pose as Point[], counterRef.current.phase));
        } else {
          setAnalysis({ angle: null, feedback: "No person detected — step into frame", level: "idle", side: "left" });
        }
        frames++;
        const now = performance.now();
        if (now - fpsT > 1000) { setFps(frames); frames = 0; fpsT = now; }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cam, modelStatus]);

  const exerciseRef = useRef(exercise);
  const runningRef = useRef(running);
  useEffect(() => { exerciseRef.current = exercise; }, [exercise]);
  useEffect(() => { runningRef.current = running; }, [running]);

  function handleSample(a: Analysis) {
    setAnalysis(a);
    if (!runningRef.current || a.angle == null) return;
    if (a.level === "warn" && warnRef.current.last !== a.feedback) warnRef.current.count++;
    warnRef.current.last = a.level === "warn" ? a.feedback : "";
    if (counterRef.current.update(a.angle)) setReps(counterRef.current.reps);
  }

  // Simulated input
  useEffect(() => {
    if (mode !== "simulated") return;
    const t = THRESHOLDS[exercise];
    let id: ReturnType<typeof setInterval> | undefined;
    if (simAuto && running) {
      const t0 = performance.now();
      id = setInterval(() => {
        const ph = ((performance.now() - t0) / 3000) * 2 * Math.PI;
        const lo = t.flexed - 10, hi = t.extended + 10;
        setSimAngle(Math.round(lo + ((Math.cos(ph) + 1) / 2) * (hi - lo)));
      }, 60);
    }
    return () => clearInterval(id);
  }, [mode, simAuto, running, exercise]);

  useEffect(() => {
    if (mode !== "simulated") return;
    const phase = counterRef.current.phase;
    handleSample({
      angle: simAngle,
      feedback: phase === "flexed" ? "Simulated: flexed phase reached" : "Simulated: extended phase",
      level: "good",
      side: "left",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simAngle, mode]);

  const startSession = () => {
    counterRef.current = RepCounter.for(exercise);
    warnRef.current = { count: 0, last: "" };
    setReps(0);
    setElapsed(0);
    setLastSummary(null);
    startRef.current = performance.now();
    setRunning(true);
  };

  const stopSession = () => {
    setRunning(false);
    const dur = startRef.current ? (performance.now() - startRef.current) / 1000 : 0;
    startRef.current = null;
    const rec: SessionRecord = {
      id: crypto.randomUUID(),
      exercise,
      reps: counterRef.current.reps,
      durationSec: Math.round(dur),
      startedAt: new Date(Date.now() - dur * 1000).toISOString(),
      mode,
      warnings: warnRef.current.count,
    };
    setLastSummary(rec);
    persist([rec, ...history].slice(0, 50));
  };

  const switchMode = (m: Mode) => {
    if (running) stopSession();
    if (m === "simulated") stopCamera();
    setAnalysis(null);
    setMode(m);
  };

  const canStart = mode === "simulated" || (cam === "on" && modelStatus === "ready");
  const angle = analysis?.angle;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Computer vision · in-browser</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">Real-Time Posture Detection<br className="hidden sm:block" /> & Rep Counter</h1>
        </div>
        <div role="tablist" aria-label="Input mode" className="inline-flex rounded-lg border border-border bg-card p-1">
          {(["live", "simulated"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              disabled={m === "live" && !!unsupported}
              onClick={() => switchMode(m)}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "live" ? "Live camera" : "Demo (simulated)"}
            </button>
          ))}
        </div>
      </header>

      {unsupported && (
        <Notice tone="warn" title="Live detection unavailable on this device">
          {unsupported} You can still explore the counter in demo mode — values there are simulated, not detected.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section aria-label="Video" className="space-y-4">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-card grid-lines">
            <video ref={videoRef} className={cn("absolute inset-0 h-full w-full -scale-x-100 object-cover", (mode !== "live" || cam !== "on") && "hidden")} playsInline muted aria-label="Your camera feed" />
            <canvas ref={canvasRef} className={cn("pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover", mode !== "live" && "hidden")} aria-hidden />

            <div className="absolute left-3 top-3 flex gap-2">
              {mode === "live" && cam === "on" && <Badge variant="live">● Live inference</Badge>}
              {mode === "simulated" && <Badge variant="simulated">Simulated — not real detection</Badge>}
              {mode === "live" && cam === "on" && modelStatus === "ready" && <Badge variant="secondary" className="font-mono">{fps} fps</Badge>}
            </div>

            {mode === "live" && cam !== "on" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <CameraOff className="h-10 w-10 text-muted-foreground" aria-hidden />
                <p className="max-w-sm text-sm text-muted-foreground">
                  {cam === "requesting" ? "Waiting for camera permission…" : "Camera is off. Video stays on your device — frames are processed locally in your browser."}
                </p>
              </div>
            )}
            {mode === "live" && cam === "on" && modelStatus === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading pose model…
              </div>
            )}
            {mode === "simulated" && <SimFigure exercise={exercise} angle={simAngle} />}
          </div>

          {camError && <Notice tone="error" title="Camera problem">{camError}</Notice>}
          {modelError && <Notice tone="error" title="Pose model failed to load">{modelError}. Check your connection; the model is downloaded from Google's CDN. Demo mode is still available.</Notice>}

          <div className="flex flex-wrap items-center gap-3">
            {mode === "live" && (cam === "on" ? (
              <Button variant="outline" onClick={() => { if (running) stopSession(); stopCamera(); }}><CameraOff /> Stop camera</Button>
            ) : (
              <Button variant="outline" onClick={startCamera} disabled={cam === "requesting"}><Camera /> {cam === "denied" ? "Retry camera" : "Enable camera"}</Button>
            ))}
            {running ? (
              <Button variant="destructive" onClick={stopSession}><Square /> End session</Button>
            ) : (
              <Button onClick={startSession} disabled={!canStart} className="shadow-glow"><Play /> Start session</Button>
            )}
            {!canStart && mode === "live" && <span className="text-sm text-muted-foreground">Enable the camera to start.</span>}
          </div>

          {mode === "simulated" && (
            <div className="rounded-xl border border-simulated/40 bg-card p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium"><FlaskConical className="h-4 w-4 text-simulated" aria-hidden /> Manual simulation controls</div>
              <div className="flex items-center gap-3">
                <Switch id="auto" checked={simAuto} onCheckedChange={setSimAuto} />
                <Label htmlFor="auto">Auto-generate a rep cycle while session runs</Label>
              </div>
              <Label htmlFor="sim-angle" className="mt-4 block text-sm text-muted-foreground">Simulated joint angle: <span className="font-mono text-foreground">{simAngle}°</span></Label>
              <Slider id="sim-angle" className="mt-2" min={20} max={180} step={1} value={[simAngle]} disabled={simAuto && running} onValueChange={([v]) => setSimAngle(v)} aria-label="Simulated joint angle" />
              <p className="mt-3 text-xs text-muted-foreground">This feeds synthetic angles into the same finite-state rep counter used for live mode. No pose inference happens here.</p>
            </div>
          )}
        </section>

        <aside className="space-y-4" aria-label="Session stats">
          <div className="rounded-xl border border-border bg-card p-4">
            <Label htmlFor="exercise" className="text-xs uppercase tracking-wider text-muted-foreground">Exercise</Label>
            <div id="exercise" role="radiogroup" className="mt-2 grid grid-cols-2 gap-2">
              {(Object.keys(EX_LABEL) as Exercise[]).map((ex) => (
                <button key={ex} role="radio" aria-checked={exercise === ex} disabled={running}
                  onClick={() => { setExercise(ex); counterRef.current = RepCounter.for(ex); setReps(0); setSimAngle(170); }}
                  className={cn("rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50",
                    exercise === ex ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent")}>
                  {EX_LABEL[ex]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {exercise === "squat" ? "Stand side-on. Knee angle ≤ 90° then ≥ 160° = 1 rep." : "Stand side-on. Elbow angle ≤ 45° then ≥ 150° = 1 rep."}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 text-center shadow-glow">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Repetitions</p>
            <p className="font-mono text-7xl font-bold text-primary" aria-live="polite" aria-atomic>{reps}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-left">
              <Stat icon={<Timer className="h-4 w-4" />} label="Time" value={formatTime(elapsed)} />
              <Stat icon={<Activity className="h-4 w-4" />} label="Angle" value={angle != null ? `${Math.round(angle)}°` : "—"} />
            </div>
          </div>

          <div className={cn("rounded-xl border p-4",
            analysis?.level === "warn" ? "border-warning/60 bg-warning/10" : analysis?.level === "good" ? "border-primary/40 bg-primary/5" : "border-border bg-card")}
            role="status" aria-live="polite">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Form feedback {mode === "simulated" && "(simulated)"}</p>
            <p className="mt-1 font-medium">{analysis?.feedback ?? "Start the camera or demo to see feedback."}</p>
          </div>

          {lastSummary && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Session summary</p>
              <p className="mt-1 text-lg font-semibold">{lastSummary.reps} × {EX_LABEL[lastSummary.exercise]}</p>
              <p className="text-sm text-muted-foreground">
                {formatTime(lastSummary.durationSec)} · {lastSummary.durationSec > 0 ? (lastSummary.reps / (lastSummary.durationSec / 60)).toFixed(1) : "0"} reps/min · {lastSummary.warnings} form warnings
              </p>
              {lastSummary.mode === "simulated" && <Badge variant="simulated" className="mt-2">Simulated data</Badge>}
            </div>
          )}
        </aside>
      </div>

      <section className="mt-10" aria-labelledby="hist">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="hist" className="text-xl font-semibold">Session history</h2>
          {history.length > 0 && <Button variant="ghost" size="sm" onClick={() => persist([])}><Trash2 /> Clear</Button>}
        </div>
        {history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No sessions yet. Completed sessions are saved on this device.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="p-3">Date</th><th className="p-3">Exercise</th><th className="p-3">Reps</th><th className="p-3">Duration</th><th className="p-3">Warnings</th><th className="p-3">Source</th></tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-border">
                    <td className="p-3 font-mono text-xs">{new Date(h.startedAt).toLocaleString()}</td>
                    <td className="p-3">{EX_LABEL[h.exercise]}</td>
                    <td className="p-3 font-mono">{h.reps}</td>
                    <td className="p-3 font-mono">{formatTime(h.durationSec)}</td>
                    <td className="p-3 font-mono">{h.warnings}</td>
                    <td className="p-3">{h.mode === "live" ? <Badge variant="outline">Live</Badge> : <Badge variant="simulated">Simulated</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
        Pose estimation by MediaPipe Pose Landmarker (lite) running locally via WebAssembly. Not medical advice. A companion FastAPI backend lives in <code className="font-mono">/backend</code>.
      </footer>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary p-3">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</p>
      <p className="font-mono text-xl font-semibold">{value}</p>
    </div>
  );
}

function Notice({ tone, title, children }: { tone: "warn" | "error"; title: string; children: React.ReactNode }) {
  return (
    <div role="alert" className={cn("mb-4 flex gap-3 rounded-xl border p-4 text-sm",
      tone === "warn" ? "border-warning/50 bg-warning/10" : "border-destructive/50 bg-destructive/10")}>
      <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "warn" ? "text-warning" : "text-destructive")} aria-hidden />
      <div><p className="font-semibold">{title}</p><p className="text-muted-foreground">{children}</p></div>
    </div>
  );
}

/** Schematic stick figure driven by the simulated angle — explicitly a drawing, not a detection. */
function SimFigure({ exercise, angle }: { exercise: Exercise; angle: number }) {
  const rad = (angle * Math.PI) / 180;
  if (exercise === "bicep_curl") {
    const sh = { x: 200, y: 80 }, el = { x: 200, y: 170 };
    const wr = { x: el.x + Math.sin(Math.PI - rad) * 80, y: el.y - Math.cos(Math.PI - rad) * 80 };
    return (
      <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" role="img" aria-label={`Simulated arm at ${angle} degrees`}>
        <line x1={200} y1={40} x2={200} y2={240} className="stroke-muted-foreground" strokeWidth={6} strokeLinecap="round" />
        <circle cx={200} cy={30} r={18} className="fill-muted-foreground" />
        <polyline points={`${sh.x},${sh.y} ${el.x},${el.y} ${wr.x},${wr.y}`} className="fill-none stroke-simulated" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={el.x} cy={el.y} r={7} className="fill-primary" />
      </svg>
    );
  }
  const hip = { y: 140 }, half = Math.PI - rad;
  const kn = { x: 200 + Math.sin(half / 2) * 70, y: hip.y + Math.cos(half / 2) * 70 };
  const an = { x: kn.x - Math.sin(half / 2) * 70, y: kn.y + Math.cos(half / 2) * 70 };
  const drop = 280 - an.y;
  return (
    <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" role="img" aria-label={`Simulated squat, knee at ${angle} degrees`}>
      <g transform={`translate(0 ${drop})`}>
        <circle cx={195} cy={30} r={18} className="fill-muted-foreground" />
        <line x1={195} y1={50} x2={200} y2={hip.y} className="stroke-muted-foreground" strokeWidth={6} strokeLinecap="round" />
        <polyline points={`200,${hip.y} ${kn.x},${kn.y} ${an.x},${an.y}`} className="fill-none stroke-simulated" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={kn.x} cy={kn.y} r={7} className="fill-primary" />
      </g>
    </svg>
  );
}