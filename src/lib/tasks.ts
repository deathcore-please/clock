import type { TaskItem, TaskState } from "../types/tasks";

export const TASK_PAGE_SIZE = 12;

export type TaskDensity = "compact" | "medium" | "dense";

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isTaskItem(value: unknown): value is TaskItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<TaskItem>;
  return (
    typeof item.uid === "string" &&
    item.uid.length > 0 &&
    typeof item.summary === "string" &&
    item.summary.trim().length > 0 &&
    isIsoDate(item.firstSeenAt)
  );
}

export function isTaskState(value: unknown): value is TaskState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<TaskState>;
  return (
    (state.status === "ready" ||
      state.status === "stale" ||
      state.status === "unavailable") &&
    (state.updatedAt === null || isIsoDate(state.updatedAt)) &&
    Array.isArray(state.items) &&
    state.items.every(isTaskItem)
  );
}

function localDayNumber(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return Math.floor(
    Date.UTC(value("year"), value("month") - 1, value("day")) / 86_400_000,
  );
}

export function formatTaskAge(
  firstSeenAt: string,
  now = new Date(),
  timezone = "Europe/London",
): string {
  const firstSeen = new Date(firstSeenAt);
  if (!Number.isFinite(firstSeen.getTime()) || !Number.isFinite(now.getTime())) return "\u2014";

  const days = Math.max(0, localDayNumber(now, timezone) - localDayNumber(firstSeen, timezone));
  return `${days} ${days === 1 ? "DAY" : "DAYS"}`;
}

export function getTaskDensity(count: number): TaskDensity {
  if (count <= 4) return "compact";
  if (count <= 8) return "medium";
  return "dense";
}

export function getTaskPageCount(
  count: number,
  pageSize = TASK_PAGE_SIZE,
): number {
  if (!Number.isFinite(count) || count <= 0) return 1;
  return Math.max(1, Math.ceil(count / Math.max(1, Math.floor(pageSize))));
}

export function paginateTasks(
  items: TaskItem[],
  page: number,
  pageSize = TASK_PAGE_SIZE,
): TaskItem[] {
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = getTaskPageCount(items.length, size);
  const normalizedPage = ((Math.floor(page) % pageCount) + pageCount) % pageCount;
  return items.slice(normalizedPage * size, normalizedPage * size + size);
}

export function nextTaskPage(
  page: number,
  count: number,
  pageSize = TASK_PAGE_SIZE,
): number {
  return (Math.floor(page) + 1) % getTaskPageCount(count, pageSize);
}
