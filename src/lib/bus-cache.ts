import type { BusState } from "../types/bus";

export const BUS_CACHE_KEY = "wall-clock-bus-state-v1";
const MAX_CACHE_AGE_MS = 5 * 60 * 1_000;

interface CachedBusState {
  savedAt: string;
  localDate: string;
  state: BusState;
}

function localDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function saveBusState(
  state: BusState,
  now = new Date(),
  timezone = "Europe/London",
) {
  if (!state.position || (state.status !== "ready" && state.status !== "stale")) return;
  const cached: CachedBusState = {
    savedAt: now.toISOString(),
    localDate: localDate(now, timezone),
    state,
  };
  localStorage.setItem(BUS_CACHE_KEY, JSON.stringify(cached));
}

export function loadBusState(
  now = new Date(),
  timezone = "Europe/London",
): BusState | null {
  try {
    const raw = localStorage.getItem(BUS_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedBusState;
    const savedAt = Date.parse(cached.savedAt);
    if (
      cached.localDate !== localDate(now, timezone) ||
      !Number.isFinite(savedAt) ||
      now.getTime() - savedAt > MAX_CACHE_AGE_MS ||
      !cached.state?.position
    ) {
      return null;
    }
    return { ...cached.state, status: "stale" };
  } catch {
    return null;
  }
}
