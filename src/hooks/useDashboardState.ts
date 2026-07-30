import { useCallback, useEffect, useRef, useState } from "react";
import { loadDashboardState, saveDashboardState } from "../lib/dashboard-cache";
import {
  neutralAmbientLight,
  type DashboardState,
} from "../types/dashboard";

const REFRESH_INTERVAL_MS = 10 * 60 * 1_000;
const defaultTimezone = import.meta.env.VITE_DISPLAY_TIMEZONE || "Europe/London";

function unavailableState(): DashboardState {
  const now = new Date().toISOString();
  return {
    version: 2,
    generatedAt: now,
    weather: {
      status: "unavailable",
      fetchedAt: null,
      location: {
        name: "Weather",
        timezone: defaultTimezone,
      },
      current: null,
      forecast: [],
    },
    ambient: {
      light: { ...neutralAmbientLight },
    },
  };
}

async function requestDashboardState(signal?: AbortSignal): Promise<DashboardState> {
  const response = await fetch("/api/state", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error("Weather is unavailable");
  }

  return (await response.json()) as DashboardState;
}

export function useDashboardState(): DashboardState {
  const cachedAtStartup = useRef<DashboardState | null>(null);
  if (cachedAtStartup.current === null) {
    cachedAtStartup.current = loadDashboardState();
  }

  const [state, setState] = useState<DashboardState>(
    () => cachedAtStartup.current ?? unavailableState(),
  );
  const lastRefresh = useRef(0);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const nextState = await requestDashboardState(signal);
      saveDashboardState(nextState);
      setState(nextState);
      lastRefresh.current = Date.now();
    } catch {
      const cached = loadDashboardState();
      setState(cached ?? unavailableState());
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);

    const interval = window.setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRefresh.current >= REFRESH_INTERVAL_MS
      ) {
        void refresh();
      }
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
