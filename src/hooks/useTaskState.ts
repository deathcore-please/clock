import { useCallback, useEffect, useRef, useState } from "react";
import { loadTaskState, saveTaskState } from "../lib/task-cache";
import { isTaskState } from "../lib/tasks";
import { unavailableTaskState, type TaskState } from "../types/tasks";

export const TASK_REFRESH_INTERVAL_MS = 5_000;
export const TASK_REQUEST_TIMEOUT_MS = 8_000;

export function useTaskState(): TaskState {
  const [state, setState] = useState<TaskState>(
    () => loadTaskState() ?? { ...unavailableTaskState },
  );
  const currentState = useRef(state);
  const requestInFlight = useRef(false);

  const useFallback = useCallback(() => {
    const cached = loadTaskState();
    const current = currentState.current;
    const fallback =
      (current.status !== "unavailable"
        ? { ...current, status: "stale" as const }
        : cached ?? { ...unavailableTaskState });
    currentState.current = fallback;
    setState(fallback);
  }, []);

  const useStateSnapshot = useCallback((nextState: TaskState) => {
    currentState.current = nextState;
    setState(nextState);
  }, []);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (signal?.aborted || requestInFlight.current) return;
      requestInFlight.current = true;
      const requestController = new AbortController();
      const abortRequest = () => requestController.abort();
      signal?.addEventListener("abort", abortRequest, { once: true });
      const timeout = window.setTimeout(
        abortRequest,
        TASK_REQUEST_TIMEOUT_MS,
      );

      try {
        const response = await fetch("/api/tasks-state", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: requestController.signal,
        });
        if (!response.ok) throw new Error("Task state is unavailable");

        const nextState: unknown = await response.json();
        if (!isTaskState(nextState) || nextState.status === "unavailable") {
          useFallback();
          return;
        }

        saveTaskState(nextState);
        useStateSnapshot(nextState);
      } catch {
        if (!signal?.aborted) useFallback();
      } finally {
        window.clearTimeout(timeout);
        signal?.removeEventListener("abort", abortRequest);
        requestInFlight.current = false;
      }
    },
    [useFallback, useStateSnapshot],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const interval = window.setInterval(
      () => void refresh(controller.signal),
      TASK_REFRESH_INTERVAL_MS,
    );
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh(controller.signal);
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
