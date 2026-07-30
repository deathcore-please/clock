import { describe, expect, it } from "vitest";
import { formatClockParts, formatDate, formatForecastTime } from "./formatters";

describe("date and time formatting", () => {
  it("uses a 24-hour Europe/London clock", () => {
    const date = new Date("2026-07-29T17:04:09.000Z");
    expect(formatClockParts(date, "Europe/London")).toEqual({
      hour: "18",
      minute: "04",
      second: "09",
    });
    expect(formatDate(date, "Europe/London")).toContain("Wednesday");
    expect(formatForecastTime(date.toISOString(), "Europe/London")).toBe("18:04");
  });
});

