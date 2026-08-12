// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../../../functions/api/tasks-state";
import { onRequestPost } from "../../../functions/api/tasks-update";
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
} from "../../../functions/api/ambient-types";
import {
  TASK_ENTITY_ID,
  TASKS_STALE_AFTER_MS,
  normaliseTaskUpdate,
  taskSnapshotFromRow,
  taskStateFromSnapshot,
  type PersistedTaskItem,
  type TaskDatabaseRow,
} from "../../lib/task-state";

const SECRET = "test-webhook-secret";

class MemoryD1 implements D1DatabaseLike {
  row: TaskDatabaseRow | null = null;
  runCount = 0;
  failReads = false;
  failWrites = false;

  prepare(query: string): D1PreparedStatementLike {
    let values: unknown[] = [];
    const statement: D1PreparedStatementLike = {
      bind: (...nextValues) => {
        values = nextValues;
        return statement;
      },
      first: async <T>() => {
        if (this.failReads) throw new Error("read failed");
        if (!query.includes("FROM task_state")) throw new Error("Unexpected SQL");
        return this.row as T | null;
      },
      run: async () => {
        if (this.failWrites) throw new Error("write failed");
        if (!query.includes("INSERT INTO task_state")) throw new Error("Unexpected SQL");
        const [entityId, itemsJson, updatedAt] = values;
        this.row = {
          entity_id: String(entityId),
          items_json: String(itemsJson),
          updated_at: Number(updatedAt),
        };
        this.runCount += 1;
        return { success: true };
      },
    };
    return statement;
  }
}

function updateRequest(body: unknown, secret = SECRET): Request {
  return new Request("https://clock.example/api/tasks-update", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function updatePayload(items: unknown[]) {
  return { entity_id: TASK_ENTITY_ID, items };
}

function task(
  uid: string,
  summary: string,
  status: "needs_action" | "completed" = "needs_action",
) {
  return { uid, summary, status };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("task snapshot normalization", () => {
  it("preserves firstSeenAt by uid while replacing the complete ordered snapshot", () => {
    const first = normaliseTaskUpdate(
      updatePayload([task("a", "First"), task("b", "Second")]),
      null,
      Date.parse("2026-08-12T09:00:00Z"),
    );
    const second = normaliseTaskUpdate(
      updatePayload([
        task("b", "Second renamed", "completed"),
        task("c", "Third"),
      ]),
      first,
      Date.parse("2026-08-12T09:01:00Z"),
    );

    expect(second.items).toEqual([
      {
        uid: "b",
        summary: "Second renamed",
        status: "completed",
        firstSeenAt: "2026-08-12T09:00:00.000Z",
      },
      {
        uid: "c",
        summary: "Third",
        status: "needs_action",
        firstSeenAt: "2026-08-12T09:01:00.000Z",
      },
    ]);

    const reopened = normaliseTaskUpdate(
      updatePayload([task("b", "Second renamed")]),
      second,
      Date.parse("2026-08-12T09:02:00Z"),
    );
    expect(reopened.items).toEqual([
      {
        uid: "b",
        summary: "Second renamed",
        status: "needs_action",
        firstSeenAt: "2026-08-12T09:00:00.000Z",
      },
    ]);
  });

  it("accepts extra Home Assistant fields but rejects invalid required fields and duplicates", () => {
    expect(
      normaliseTaskUpdate(
        updatePayload([
          {
            ...task("a", "A task"),
            due: "2026-08-13",
            description: "Ignored by the clock bridge",
          },
        ]),
        null,
      ).items,
    ).toHaveLength(1);
    expect(() =>
      normaliseTaskUpdate(updatePayload([{ uid: "a", summary: "Missing status" }]), null),
    ).toThrow();
    expect(() =>
      normaliseTaskUpdate(updatePayload([task("a", "One"), task("a", "Two")]), null),
    ).toThrow();
    expect(() =>
      normaliseTaskUpdate({ entity_id: "todo.not_the_list", items: [] }, null),
    ).toThrow();
  });

  it("returns incomplete items only and keeps them when the snapshot becomes stale", () => {
    const snapshot = normaliseTaskUpdate(
      updatePayload([task("a", "Pending"), task("b", "Done", "completed")]),
      null,
      Date.parse("2026-08-12T09:00:00Z"),
    );
    expect(taskStateFromSnapshot(snapshot, Date.parse("2026-08-12T09:01:00Z"))).toEqual({
      status: "ready",
      updatedAt: "2026-08-12T09:00:00.000Z",
      items: [
        {
          uid: "a",
          summary: "Pending",
          firstSeenAt: "2026-08-12T09:00:00.000Z",
        },
      ],
    });
    expect(
      taskStateFromSnapshot(snapshot, Date.parse("2026-08-12T09:00:00Z") + TASKS_STALE_AFTER_MS + 1),
    ).toMatchObject({ status: "stale", items: [{ uid: "a", summary: "Pending" }] });
  });

  it("treats a missing or malformed database snapshot as unavailable", () => {
    expect(taskStateFromSnapshot(null)).toEqual({
      status: "unavailable",
      updatedAt: null,
      items: [],
    });
    expect(
      taskSnapshotFromRow({
        entity_id: TASK_ENTITY_ID,
        items_json: "not json",
        updated_at: Date.now(),
      }),
    ).toBeNull();
  });
});

describe("task update function", () => {
  it("rejects missing or incorrect bearer authentication", async () => {
    const database = new MemoryD1();
    const response = await onRequestPost({
      request: updateRequest(updatePayload([]), "wrong"),
      env: { AMBIENT_DB: database, AMBIENT_WEBHOOK_SECRET: SECRET },
    });
    expect(response.status).toBe(401);
    expect(database.runCount).toBe(0);
  });

  it("rejects malformed payloads and the wrong to-do entity", async () => {
    const database = new MemoryD1();
    const malformed = await onRequestPost({
      request: updateRequest(updatePayload([{ uid: "a", summary: "A" }])),
      env: { AMBIENT_DB: database, AMBIENT_WEBHOOK_SECRET: SECRET },
    });
    const wrongEntity = await onRequestPost({
      request: updateRequest({ entity_id: "todo.other", items: [] }),
      env: { AMBIENT_DB: database, AMBIENT_WEBHOOK_SECRET: SECRET },
    });
    expect(malformed.status).toBe(400);
    expect(wrongEntity.status).toBe(400);
    expect(database.runCount).toBe(0);
  });

  it("replaces the full snapshot, preserves firstSeenAt, and returns pending items", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T09:00:00Z"));
    const database = new MemoryD1();
    await onRequestPost({
      request: updateRequest(updatePayload([task("a", "Pending"), task("b", "Done")])),
      env: { AMBIENT_DB: database, AMBIENT_WEBHOOK_SECRET: SECRET },
    });

    vi.setSystemTime(new Date("2026-08-12T09:01:00Z"));
    const response = await onRequestPost({
      request: updateRequest(
        updatePayload([task("b", "Done", "completed"), task("c", "New pending")]),
      ),
      env: { AMBIENT_DB: database, AMBIENT_WEBHOOK_SECRET: SECRET },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "ready",
      updatedAt: "2026-08-12T09:01:00.000Z",
      items: [
        {
          uid: "c",
          summary: "New pending",
          firstSeenAt: "2026-08-12T09:01:00.000Z",
        },
      ],
    });
    const stored = JSON.parse(database.row?.items_json ?? "[]") as PersistedTaskItem[];
    expect(stored).toEqual([
      expect.objectContaining({
        uid: "b",
        status: "completed",
        firstSeenAt: "2026-08-12T09:00:00.000Z",
      }),
      expect.objectContaining({
        uid: "c",
        status: "needs_action",
        firstSeenAt: "2026-08-12T09:01:00.000Z",
      }),
    ]);
  });

  it("returns service unavailable for database failures", async () => {
    const readFailure = new MemoryD1();
    readFailure.failReads = true;
    const readResponse = await onRequestPost({
      request: updateRequest(updatePayload([])),
      env: { AMBIENT_DB: readFailure, AMBIENT_WEBHOOK_SECRET: SECRET },
    });
    const writeFailure = new MemoryD1();
    writeFailure.failWrites = true;
    const writeResponse = await onRequestPost({
      request: updateRequest(updatePayload([])),
      env: { AMBIENT_DB: writeFailure, AMBIENT_WEBHOOK_SECRET: SECRET },
    });
    expect(readResponse.status).toBe(503);
    expect(writeResponse.status).toBe(503);
  });
});

describe("task state function", () => {
  it("returns ready and stale snapshots without caching or dropping pending items", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T09:00:00Z"));
    const database = new MemoryD1();
    await onRequestPost({
      request: updateRequest(updatePayload([task("a", "Pending"), task("b", "Done", "completed")])),
      env: { AMBIENT_DB: database, AMBIENT_WEBHOOK_SECRET: SECRET },
    });

    const ready = await onRequestGet({ env: { AMBIENT_DB: database } });
    expect(ready.headers.get("Cache-Control")).toBe("no-store");
    expect(await ready.json()).toMatchObject({
      status: "ready",
      items: [{ uid: "a", summary: "Pending" }],
    });

    vi.setSystemTime(new Date(Date.now() + TASKS_STALE_AFTER_MS + 1));
    const stale = await onRequestGet({ env: { AMBIENT_DB: database } });
    expect(await stale.json()).toMatchObject({
      status: "stale",
      items: [{ uid: "a", summary: "Pending" }],
    });
  });

  it("returns unavailable for no snapshot and database failure", async () => {
    const empty = new MemoryD1();
    const emptyResponse = await onRequestGet({ env: { AMBIENT_DB: empty } });
    expect(emptyResponse.status).toBe(200);
    expect(await emptyResponse.json()).toEqual({
      status: "unavailable",
      updatedAt: null,
      items: [],
    });

    const failed = new MemoryD1();
    failed.failReads = true;
    const failedResponse = await onRequestGet({ env: { AMBIENT_DB: failed } });
    expect(failedResponse.status).toBe(503);
    expect(failedResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(await failedResponse.json()).toEqual({
      status: "unavailable",
      updatedAt: null,
      items: [],
    });
  });
});
