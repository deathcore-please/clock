import { describe, expect, it } from "vitest";
import { getCommuteMode, previewBusScenario } from "./commute-mode";

describe("weekday commute timing", () => {
  it.each([
    ["2026-08-03T07:05:59Z", false, false],
    ["2026-08-03T07:06:00Z", true, false],
    ["2026-08-03T07:08:00Z", true, true],
    ["2026-08-03T07:29:59Z", true, true],
    ["2026-08-03T07:30:00Z", false, false],
  ])("handles London time at %s", (iso, prefetch, visible) => {
    expect(getCommuteMode(new Date(iso), "Europe/London")).toEqual({
      prefetch,
      visible,
    });
  });

  it("uses Europe/London daylight-saving time", () => {
    expect(getCommuteMode(new Date("2026-03-30T07:08:00Z"), "Europe/London")).toEqual({
      prefetch: true,
      visible: true,
    });
  });

  it("never enables commute mode at the weekend", () => {
    expect(getCommuteMode(new Date("2026-08-01T07:08:00Z"), "Europe/London")).toEqual({
      prefetch: false,
      visible: false,
    });
  });

  it("accepts preview scenarios only when development previews are enabled", () => {
    expect(previewBusScenario("?previewBus=outbound", true)).toBe("outbound");
    expect(previewBusScenario("?previewBus=made-up", true)).toBeNull();
    expect(previewBusScenario("?previewBus=outbound", false)).toBeNull();
  });
});
