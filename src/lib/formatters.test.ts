import { describe, expect, it } from "vitest";
import {
  formatClockParts,
  formatDate,
  formatForecastTime,
  formatTimeZoneDifference,
} from "./formatters";

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

  it("formats New Delhi time and follows London's daylight-saving offset", () => {
    const winter = new Date("2026-01-15T12:00:00.000Z");
    const summer = new Date("2026-07-15T12:00:00.000Z");

    expect(formatClockParts(winter, "Asia/Kolkata")).toMatchObject({
      hour: "17",
      minute: "30",
    });
    expect(
      formatTimeZoneDifference(winter, "Europe/London", "Asia/Kolkata"),
    ).toBe("+5h 30m");
    expect(
      formatTimeZoneDifference(summer, "Europe/London", "Asia/Kolkata"),
    ).toBe("+4h 30m");
  });
});

