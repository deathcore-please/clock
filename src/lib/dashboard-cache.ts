import type { DashboardState } from "../types/dashboard";

export const DASHBOARD_CACHE_KEY = "wall-clock:dashboard-state:v2";

function isDashboardState(value: unknown): value is DashboardState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const state = value as Partial<DashboardState>;
  return (
    state.version === 2 &&
    typeof state.generatedAt === "string" &&
    Boolean(state.weather?.current) &&
    typeof state.weather?.current?.highTemperatureC === "number" &&
    typeof state.weather?.current?.lowTemperatureC === "number" &&
    Array.isArray(state.weather?.forecast) &&
    state.weather.forecast.length === 8
  );
}

export function saveDashboardState(
  state: DashboardState,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): void {
  if (state.weather.status !== "ready") {
    return;
  }

  try {
    storage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(state));
  } catch {
    // A wall display must continue working when storage is blocked or full.
  }
}

export function loadDashboardState(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): DashboardState | null {
  try {
    const raw = storage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isDashboardState(parsed)) {
      return null;
    }

    return {
      ...parsed,
      weather: {
        ...parsed.weather,
        status: "stale",
      },
    };
  } catch {
    return null;
  }
}
