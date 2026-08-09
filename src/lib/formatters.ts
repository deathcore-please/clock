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

function timeZoneOffsetMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wallClockAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  const instantWithoutMilliseconds = date.getTime() - date.getMilliseconds();

  return Math.round((wallClockAsUtc - instantWithoutMilliseconds) / 60_000);
}

export function formatTimeZoneDifference(
  date: Date,
  fromTimezone: string,
  toTimezone: string,
): string {
  const differenceMinutes =
    timeZoneOffsetMinutes(date, toTimezone) -
    timeZoneOffsetMinutes(date, fromTimezone);
  const absoluteMinutes = Math.abs(differenceMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  const sign = differenceMinutes >= 0 ? "+" : "-";

  return `${sign}${hours}h${minutes === 0 ? "" : ` ${minutes}m`}`;
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
