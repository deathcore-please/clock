import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TASK_CACHE_KEY } from "../lib/task-cache";
import { TASK_REFRESH_INTERVAL_MS, useTaskState } from "./useTaskState";
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

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useTaskState", () => {
  it("loads immediately and stores a valid response", async () => {
    const fetcher = vi.fn(async () => Response.json(readyState));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useTaskState());

    await waitFor(() => expect(result.current).toEqual(readyState));
    expect(fetcher).toHaveBeenCalledWith(
      "/api/tasks-state",
      expect.objectContaining({ cache: "no-store", method: "GET" }),
    );
    expect(localStorage.getItem(TASK_CACHE_KEY)).not.toBeNull();
  });

  it("polls every two seconds and refreshes when visible", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => Response.json(readyState));
    vi.stubGlobal("fetch", fetcher);
    renderHook(() => useTaskState());

    await act(async () => Promise.resolve());
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(TASK_REFRESH_INTERVAL_MS);
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("uses a cached snapshot as stale when the request fails", async () => {
    localStorage.setItem(TASK_CACHE_KEY, JSON.stringify(readyState));
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const { result } = renderHook(() => useTaskState());

    expect(result.current).toEqual({ ...readyState, status: "stale" });
    await waitFor(() => expect(result.current.status).toBe("stale"));
  });

  it("falls back to unavailable with no valid cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ...readyState, items: [{ bad: true }] })),
    );
    const { result } = renderHook(() => useTaskState());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.items).toEqual([]);
  });
});
