import { describe, expect, it, vi } from "vitest";
import { createMockDashboardState } from "../mocks/dashboard";
import {
  DASHBOARD_CACHE_KEY,
  loadDashboardState,
  saveDashboardState,
} from "./dashboard-cache";

describe("dashboard cache", () => {
  it("stores ready state and restores it as stale", () => {
    const state = createMockDashboardState(new Date("2026-07-29T12:00:00Z"));
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    saveDashboardState(state, storage);
    const restored = loadDashboardState(storage);

    expect(values.has(DASHBOARD_CACHE_KEY)).toBe(true);
    expect(restored?.weather.status).toBe("stale");
    expect(restored?.weather.forecast).toHaveLength(8);
  });

  it("ignores invalid cached content", () => {
    const storage = { getItem: vi.fn(() => "{\"version\":0}") };
    expect(loadDashboardState(storage)).toBeNull();
  });
});

