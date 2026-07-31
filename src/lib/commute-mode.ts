import type { BusMockScenario } from "../types/bus";

export interface CommuteMode {
  prefetch: boolean;
  visible: boolean;
}

const weekdayFormatterCache = new Map<string, Intl.DateTimeFormat>();
const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const scenarios = new Set<BusMockScenario>([
  "station",
  "outbound",
  "inbound",
  "stale",
  "untracked",
]);

function weekdayFormatter(timezone: string) {
  let formatter = weekdayFormatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      weekday: "short",
    });
    weekdayFormatterCache.set(timezone, formatter);
  }
  return formatter;
}

function timeFormatter(timezone: string) {
  let formatter = timeFormatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    timeFormatterCache.set(timezone, formatter);
  }
  return formatter;
}

export function getCommuteMode(
  now: Date,
  timezone = "Europe/London",
): CommuteMode {
  const weekday = weekdayFormatter(timezone).format(now);
  if (weekday === "Sat" || weekday === "Sun") {
    return { prefetch: false, visible: false };
  }

  const parts = timeFormatter(timezone).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const seconds = value("hour") * 3_600 + value("minute") * 60 + value("second");
  const prefetchStart = 8 * 3_600 + 6 * 60;
  const visibleStart = 8 * 3_600 + 8 * 60;
  const end = 8 * 3_600 + 30 * 60;

  return {
    prefetch: seconds >= prefetchStart && seconds < end,
    visible: seconds >= visibleStart && seconds < end,
  };
}

export function previewBusScenario(
  search: string,
  enabled: boolean,
): BusMockScenario | null {
  if (!enabled) return null;
  const value = new URLSearchParams(search).get("previewBus") as BusMockScenario | null;
  return value && scenarios.has(value) ? value : null;
}
