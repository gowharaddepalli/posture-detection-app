import { useCallback, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export type SupportStatus = "unknown" | "checking" | "supported" | "unsupported";

export function checkBrowserSupport(): string | null {
  if (typeof window === "undefined") return "Not running in a browser.";
  if (!window.isSecureContext) return "Camera access requires HTTPS (or localhost).";
  if (!navigator.mediaDevices?.getUserMedia) return "This browser does not expose a camera API (getUserMedia).";
  if (typeof WebAssembly === "undefined") return "WebAssembly is not available in this browser.";
  return null;
}

export function usePoseLandmarker() {
  const ref = useRef<PoseLandmarker | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (ref.current) return ref.current;
    setStatus("loading");
    setError(null);
    try {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const make = (delegate: "GPU" | "CPU") =>
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      let lm: PoseLandmarker;
      try {
        lm = await make("GPU");
      } catch {
        lm = await make("CPU");
      }
      ref.current = lm;
      setStatus("ready");
      return lm;
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Failed to load pose model");
      return null;
    }
  }, []);

  return { landmarker: ref, load, status, error };
}