export interface ClockParts {
  hour: string;
  minute: string;
  second: string;
}

export function formatClockParts(date: Date, timezone: string): ClockParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return {
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

export function formatDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function formatForecastTime(isoDate: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(isoDate));
}

export function formatTemperature(value: number): string {
  return `${Math.round(value)}\u00b0`;
}
