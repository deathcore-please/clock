import type { BusState, RouteBusVehicle } from "../types/bus";
import { BUS_STALE_AFTER_SECONDS } from "./bus";

export const BUS_CACHE_KEY = "wall-clock-bus-state-v2";
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

function ageSeconds(recordedAt: string, now: Date, fallback: number) {
  const recorded = Date.parse(recordedAt);
  return Number.isFinite(recorded)
    ? Math.max(0, Math.floor((now.getTime() - recorded) / 1_000))
    : fallback;
}

function refreshVehicleAge(vehicle: RouteBusVehicle, now: Date): RouteBusVehicle {
  const age = ageSeconds(
    vehicle.tracking.recordedAt,
    now,
    vehicle.tracking.ageSeconds,
  );
  return {
    ...vehicle,
    tracking: { ...vehicle.tracking, ageSeconds: age },
    status: age >= BUS_STALE_AFTER_SECONDS ? "stale" : "ready",
  };
}

export function saveBusState(
  state: BusState,
  now = new Date(),
  timezone = "Europe/London",
) {
  if (!state.position && state.routeVehicles.length === 0) return;
  if (state.status === "unavailable") return;
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
      (!cached.state?.position && cached.state?.routeVehicles?.length === 0) ||
      !Array.isArray(cached.state?.routeVehicles)
    ) {
      return null;
    }
    const selectedAge = cached.state.tracking.recordedAt
      ? ageSeconds(
          cached.state.tracking.recordedAt,
          now,
          cached.state.tracking.ageSeconds ?? 0,
        )
      : null;
    return {
      ...cached.state,
      status: cached.state.position ? "stale" : cached.state.status,
      tracking: {
        ...cached.state.tracking,
        ageSeconds: selectedAge,
      },
      routeVehicles: cached.state.routeVehicles.map((vehicle) =>
        refreshVehicleAge(vehicle, now),
      ),
    };
  } catch {
    return null;
  }
}
