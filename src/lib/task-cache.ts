import { isTaskState } from "./tasks";
import type { TaskState } from "../types/tasks";

export const TASK_CACHE_KEY = "wall-clock:task-state:v1";

export function saveTaskState(
  state: TaskState,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): void {
  if (state.status === "unavailable") return;

  try {
    storage.setItem(TASK_CACHE_KEY, JSON.stringify(state));
  } catch {
    // The dashboard must keep running when storage is blocked or full.
  }
}

export function loadTaskState(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): TaskState | null {
  try {
    const raw = storage.getItem(TASK_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isTaskState(parsed) || parsed.status === "unavailable") return null;
    return { ...parsed, status: "stale" };
  } catch {
    return null;
  }
}
