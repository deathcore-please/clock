import { beforeEach, describe, expect, it } from "vitest";
import { createMockBusState } from "../mocks/bus";
import { BUS_CACHE_KEY, loadBusState, saveBusState } from "./bus-cache";

describe("bus browser cache", () => {
  beforeEach(() => localStorage.clear());

  it("restores a same-day recent position as stale", () => {
    const savedAt = new Date("2026-08-03T07:10:00Z");
    const state = createMockBusState("outbound", savedAt);
    saveBusState(state, savedAt, "Europe/London");
    const restored = loadBusState(
      new Date("2026-08-03T07:13:00Z"),
      "Europe/London",
    );

    expect(restored?.status).toBe("stale");
    expect(restored?.routeVehicles).toHaveLength(state.routeVehicles.length);
    expect(restored?.routeVehicles[0].tracking.ageSeconds).toBeGreaterThan(180);
    expect(restored?.routeVehicles[0].status).toBe("stale");
  });

  it("recomputes the three-minute stale boundary for every cached vehicle", () => {
    const now = new Date("2026-08-03T07:10:00Z");
    const state = createMockBusState("outbound", now);
    const vehicle = state.routeVehicles[0];
    const recordedAt = new Date(now.getTime() - 179_000).toISOString();
    const snapshot = {
      ...state,
      routeVehicles: [
        {
          ...vehicle,
          tracking: { recordedAt, ageSeconds: 179 },
          status: "ready" as const,
        },
      ],
    };
    saveBusState(snapshot, now, "Europe/London");

    expect(
      loadBusState(now, "Europe/London")?.routeVehicles[0].status,
    ).toBe("ready");
    expect(
      loadBusState(
        new Date(now.getTime() + 1_000),
        "Europe/London",
      )?.routeVehicles[0].status,
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

  it("preserves a complete multi-vehicle snapshot without a selected bus", () => {
    const savedAt = new Date("2026-08-03T07:10:00Z");
    const tracked = createMockBusState("outbound", savedAt);
    const snapshot = {
      ...tracked,
      status: "not_tracking" as const,
      phase: "not_tracking" as const,
      vehicle: { id: null },
      position: null,
      target: null,
      tracking: { recordedAt: null, ageSeconds: null },
    };

    saveBusState(snapshot, savedAt, "Europe/London");
    const restored = loadBusState(
      new Date("2026-08-03T07:13:00Z"),
      "Europe/London",
    );

    expect(restored?.status).toBe("not_tracking");
    expect(restored?.routeVehicles).toHaveLength(snapshot.routeVehicles.length);
    expect(restored?.routeVehicles.every((vehicle) => vehicle.status === "stale")).toBe(
      true,
    );
  });
});
