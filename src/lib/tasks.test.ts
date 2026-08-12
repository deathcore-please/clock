import { describe, expect, it } from "vitest";
import {
  formatTaskAge,
  getTaskDensity,
  getTaskPageCount,
  isTaskState,
  nextTaskPage,
  paginateTasks,
} from "./tasks";
import type { TaskItem } from "../types/tasks";

const tasks: TaskItem[] = Array.from({ length: 25 }, (_, index) => ({
  uid: `task-${index + 1}`,
  summary: `Task ${index + 1}`,
  firstSeenAt: "2026-08-10T10:00:00.000Z",
}));

describe("task helpers", () => {
  it("validates the public task-state contract", () => {
    expect(
      isTaskState({
        status: "ready",
        updatedAt: "2026-08-12T10:00:00.000Z",
        items: tasks.slice(0, 1),
      }),
    ).toBe(true);
    expect(
      isTaskState({
        status: "ready",
        updatedAt: null,
        items: [{ ...tasks[0], firstSeenAt: "not-a-date" }],
      }),
    ).toBe(false);
  });

  it("formats age by calendar day in the dashboard timezone", () => {
    const now = new Date("2026-08-12T00:30:00.000Z");
    expect(formatTaskAge("2026-08-11T23:45:00.000Z", now, "Europe/London")).toBe(
      "0 DAYS",
    );
    expect(formatTaskAge("2026-08-10T23:45:00.000Z", now, "Europe/London")).toBe(
      "1 DAY",
    );
    expect(formatTaskAge("2026-08-10T12:00:00.000Z", now, "Europe/London")).toBe(
      "2 DAYS",
    );
    expect(formatTaskAge("invalid", now, "Europe/London")).toBe("\u2014");
  });

  it("uses London calendar dates across a daylight-saving transition", () => {
    expect(
      formatTaskAge(
        "2026-03-28T23:30:00.000Z",
        new Date("2026-03-29T23:30:00.000Z"),
        "Europe/London",
      ),
    ).toBe("2 DAYS");
  });

  it.each([
    [0, "compact"],
    [4, "compact"],
    [5, "medium"],
    [8, "medium"],
    [9, "dense"],
    [12, "dense"],
  ] as const)("uses the expected density for %i tasks", (count, density) => {
    expect(getTaskDensity(count)).toBe(density);
  });

  it("paginates twelve tasks at a time and wraps", () => {
    expect(getTaskPageCount(tasks.length)).toBe(3);
    expect(paginateTasks(tasks, 0).map((task) => task.uid)).toEqual(
      tasks.slice(0, 12).map((task) => task.uid),
    );
    expect(paginateTasks(tasks, 1)).toHaveLength(12);
    expect(paginateTasks(tasks, 2)).toEqual(tasks.slice(24));
    expect(paginateTasks(tasks, 3)).toEqual(tasks.slice(0, 12));
    expect(nextTaskPage(2, tasks.length)).toBe(0);
  });
});
