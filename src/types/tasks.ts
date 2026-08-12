export type TaskStatus = "ready" | "stale" | "unavailable";

export interface TaskItem {
  uid: string;
  summary: string;
  firstSeenAt: string;
}

export interface TaskState {
  status: TaskStatus;
  updatedAt: string | null;
  items: TaskItem[];
}

export const unavailableTaskState: TaskState = {
  status: "unavailable",
  updatedAt: null,
  items: [],
};
