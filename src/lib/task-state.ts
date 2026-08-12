import type { TaskItem, TaskState } from "../types/tasks";

type TaskItemStatus = "needs_action" | "completed";

export interface PersistedTaskItem {
  uid: string;
  summary: string;
  status: TaskItemStatus;
  firstSeenAt: string;
}

export interface TaskSnapshot {
  entityId: string;
  items: PersistedTaskItem[];
  updatedAt: string;
}

export const TASK_ENTITY_ID = "todo.shopping_list";
export const TASKS_STALE_AFTER_MS = 2 * 60 * 1_000;

export interface TaskDatabaseRow {
  entity_id: string;
  items_json: string;
  updated_at: number;
}

interface TaskUpdatePayload {
  entity_id?: unknown;
  items?: unknown;
}

function isTaskItemStatus(value: unknown): value is TaskItemStatus {
  return value === "needs_action" || value === "completed";
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function taskSnapshotFromRow(row: TaskDatabaseRow | null): TaskSnapshot | null {
  const updatedAt = row ? new Date(row.updated_at) : null;
  if (
    !row ||
    row.entity_id !== TASK_ENTITY_ID ||
    !Number.isFinite(row.updated_at) ||
    !updatedAt ||
    !Number.isFinite(updatedAt.getTime())
  ) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.items_json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const items: PersistedTaskItem[] = [];
  const seenUids = new Set<string>();
  for (const value of parsed) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Partial<PersistedTaskItem>;
    if (
      typeof item.uid !== "string" ||
      item.uid.trim().length === 0 ||
      seenUids.has(item.uid) ||
      typeof item.summary !== "string" ||
      item.summary.trim().length === 0 ||
      !isTaskItemStatus(item.status) ||
      !isIsoDate(item.firstSeenAt)
    ) {
      return null;
    }
    seenUids.add(item.uid);
    items.push({
      uid: item.uid,
      summary: item.summary,
      status: item.status,
      firstSeenAt: item.firstSeenAt,
    });
  }

  return {
    entityId: row.entity_id,
    items,
    updatedAt: updatedAt.toISOString(),
  };
}

export function normaliseTaskUpdate(
  input: unknown,
  previous: TaskSnapshot | null,
  now = Date.now(),
): TaskSnapshot {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("The request body must be a JSON object");
  }

  const payload = input as TaskUpdatePayload;
  if (payload.entity_id !== TASK_ENTITY_ID) {
    throw new Error("Unexpected entity_id");
  }
  if (!Array.isArray(payload.items)) {
    throw new Error("items must be an array");
  }

  const updatedAt = new Date(now).toISOString();
  const previousFirstSeen = new Map(
    previous?.items.map((item) => [item.uid, item.firstSeenAt]) ?? [],
  );
  const seenUids = new Set<string>();
  const items = payload.items.map((value): PersistedTaskItem => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Each task must be an object");
    }
    const candidate = value as Record<string, unknown>;
    const uid = requiredString(candidate.uid, "uid");
    const summary = requiredString(candidate.summary, "summary");
    if (!isTaskItemStatus(candidate.status)) {
      throw new Error("status must be needs_action or completed");
    }
    if (seenUids.has(uid)) throw new Error("Task uids must be unique");
    seenUids.add(uid);

    return {
      uid,
      summary,
      status: candidate.status,
      firstSeenAt: previousFirstSeen.get(uid) ?? updatedAt,
    };
  });

  return {
    entityId: TASK_ENTITY_ID,
    items,
    updatedAt,
  };
}

export function taskStateFromSnapshot(
  snapshot: TaskSnapshot | null,
  now = Date.now(),
): TaskState {
  if (!snapshot) {
    return { status: "unavailable", updatedAt: null, items: [] };
  }

  const updatedAtMs = Date.parse(snapshot.updatedAt);
  if (!Number.isFinite(updatedAtMs)) {
    return { status: "unavailable", updatedAt: null, items: [] };
  }

  const items: TaskItem[] = snapshot.items
    .filter((item) => item.status === "needs_action")
    .map(({ uid, summary, firstSeenAt }) => ({ uid, summary, firstSeenAt }));

  return {
    status: now - updatedAtMs > TASKS_STALE_AFTER_MS ? "stale" : "ready",
    updatedAt: snapshot.updatedAt,
    items,
  };
}
