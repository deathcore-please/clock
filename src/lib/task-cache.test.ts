import { beforeEach, describe, expect, it } from "vitest";
import { loadTaskState, saveTaskState, TASK_CACHE_KEY } from "./task-cache";
import type { TaskState } from "../types/tasks";

const readyState: TaskState = {
  status: "ready",
  updatedAt: "2026-08-12T10:00:00.000Z",
  items: [
    {
      uid: "one",
      summary: "One task",
      firstSeenAt: "2026-08-11T10:00:00.000Z",
    },
  ],
};

beforeEach(() => localStorage.clear());

describe("task cache", () => {
  it("restores a valid ready snapshot as stale", () => {
    saveTaskState(readyState);
    expect(loadTaskState()).toEqual({ ...readyState, status: "stale" });
  });

  it("stores a stale server snapshot for later offline fallback", () => {
    const stale = { ...readyState, status: "stale" as const };
    saveTaskState(stale);
    expect(loadTaskState()).toEqual(stale);
  });

  it("ignores malformed and unavailable snapshots", () => {
    localStorage.setItem(TASK_CACHE_KEY, "not-json");
    expect(loadTaskState()).toBeNull();

    localStorage.setItem(
      TASK_CACHE_KEY,
      JSON.stringify({ status: "unavailable", updatedAt: null, items: [] }),
    );
    expect(loadTaskState()).toBeNull();
  });

  it("survives blocked storage", () => {
    expect(() =>
      saveTaskState(readyState, {
        setItem: () => {
          throw new Error("blocked");
        },
      }),
    ).not.toThrow();
  });
});
