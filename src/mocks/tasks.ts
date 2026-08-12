import type { TaskState } from "../types/tasks";

const summaries = [
  "Cancel passport issue application",
  "Make Black Metal",
  "Donate Clothes",
  "Install Silent Hill Origins for PSP",
];

export function createMockTaskState(now = new Date()): TaskState {
  const updatedAt = now.toISOString();
  return {
    status: "ready",
    updatedAt,
    items: summaries.map((summary, index) => ({
      uid: `mock-task-${index + 1}`,
      summary,
      firstSeenAt: updatedAt,
    })),
  };
}
