import { beforeEach, describe, expect, it } from "vitest";
import { createMockBusState } from "../mocks/bus";
import { BUS_CACHE_KEY, loadBusState, saveBusState } from "./bus-cache";

describe("bus browser cache", () => {
  beforeEach(() => localStorage.clear());

  it("restores a same-day recent position as stale", () => {
    const savedAt = new Date("2026-08-03T07:10:00Z");
    saveBusState(createMockBusState("outbound", savedAt), savedAt, "Europe/London");
    expect(
      loadBusState(new Date("2026-08-03T07:13:00Z"), "Europe/London")?.status,
    ).toBe("stale");
  });

  it("rejects positions older than five minutes or from another local day", () => {
    const savedAt = new Date("2026-08-03T07:10:00Z");
    saveBusState(createMockBusState("outbound", savedAt), savedAt, "Europe/London");
    expect(loadBusState(new Date("2026-08-03T07:15:01Z"), "Europe/London")).toBeNull();
    expect(loadBusState(new Date("2026-08-04T07:11:00Z"), "Europe/London")).toBeNull();
  });

  it("does not cache untracked responses", () => {
    saveBusState(createMockBusState("untracked"));
    expect(localStorage.getItem(BUS_CACHE_KEY)).toBeNull();
  });
});
