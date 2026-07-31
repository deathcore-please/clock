import { useCallback, useEffect, useState } from "react";
import { loadBusState, saveBusState } from "../lib/bus-cache";
import { unavailableBusState } from "../lib/bus";
import type { BusMockScenario, BusState } from "../types/bus";

const REFRESH_INTERVAL_MS = 15_000;

async function requestBusState(
  scenario: BusMockScenario | null,
  signal?: AbortSignal,
): Promise<BusState> {
  const query = scenario ? `?scenario=${encodeURIComponent(scenario)}` : "";
  const response = await fetch(`/api/bus-state${query}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("Bus tracking is unavailable");
  return (await response.json()) as BusState;
}

export function useBusState({
  enabled,
  scenario,
  timezone,
}: {
  enabled: boolean;
  scenario: BusMockScenario | null;
  timezone: string;
}): BusState | null {
  const [state, setState] = useState<BusState | null>(null);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const nextState = await requestBusState(scenario, signal);
        saveBusState(nextState, new Date(), timezone);
        setState(nextState);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState(loadBusState(new Date(), timezone) ?? unavailableBusState());
      }
    },
    [scenario, timezone],
  );

  useEffect(() => {
    if (!enabled) {
      setState(null);
      return;
    }

    const controller = new AbortController();
    void refresh(controller.signal);
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, refresh]);

  return state;
}
