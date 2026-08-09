import { useCallback, useEffect, useRef, useState } from "react";
import {
  neutralAmbientLight,
  type AmbientLightState,
} from "../types/dashboard";

const AMBIENT_REFRESH_INTERVAL_MS = 2_000;

function isAmbientLightState(value: unknown): value is AmbientLightState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<AmbientLightState>;
  return (
    typeof candidate.available === "boolean" &&
    typeof candidate.on === "boolean" &&
    (candidate.mode === "neutral" ||
      candidate.mode === "white" ||
      candidate.mode === "colour") &&
    Array.isArray(candidate.rgb) &&
    candidate.rgb.length === 3 &&
    candidate.rgb.every(
      (channel) =>
        typeof channel === "number" &&
        Number.isInteger(channel) &&
        channel >= 0 &&
        channel <= 255,
    ) &&
    typeof candidate.brightness === "number" &&
    candidate.brightness >= 0 &&
    candidate.brightness <= 255 &&
    (candidate.updatedAt === null || typeof candidate.updatedAt === "string")
  );
}

export function useAmbientLightState(): AmbientLightState {
  const [state, setState] = useState<AmbientLightState>({ ...neutralAmbientLight });
  const currentState = useRef(state);
  const requestInFlight = useRef(false);

  const updateState = useCallback((nextState: AmbientLightState) => {
    const current = currentState.current;
    if (
      current.available === nextState.available &&
      current.on === nextState.on &&
      current.mode === nextState.mode &&
      current.brightness === nextState.brightness &&
      current.updatedAt === nextState.updatedAt &&
      current.rgb.every((channel, index) => channel === nextState.rgb[index])
    ) {
      return;
    }
    currentState.current = nextState;
    setState(nextState);
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      const response = await fetch("/api/ambient-state", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Ambient state is unavailable");
      const nextState: unknown = await response.json();
      updateState(isAmbientLightState(nextState) ? nextState : { ...neutralAmbientLight });
    } catch {
      if (!signal?.aborted) updateState({ ...neutralAmbientLight });
    } finally {
      requestInFlight.current = false;
    }
  }, [updateState]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const interval = window.setInterval(() => void refresh(), AMBIENT_REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  return state;
}
