import {
  normaliseTaskUpdate,
  taskSnapshotFromRow,
  taskStateFromSnapshot,
  type TaskDatabaseRow,
} from "../../src/lib/task-state";
import type { D1DatabaseLike } from "./ambient-types";

interface Env {
  AMBIENT_DB: D1DatabaseLike;
  AMBIENT_WEBHOOK_SECRET?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  if (
    !env.AMBIENT_WEBHOOK_SECRET ||
    request.headers.get("Authorization") !== `Bearer ${env.AMBIENT_WEBHOOK_SECRET}`
  ) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  let row: TaskDatabaseRow | null;
  try {
    row = await env.AMBIENT_DB.prepare(
      `SELECT entity_id, items_json, updated_at
       FROM task_state WHERE id = 1`,
    ).first<TaskDatabaseRow>();
  } catch {
    return jsonResponse({ error: "task_update_failed" }, 503);
  }

  let snapshot;
  try {
    snapshot = normaliseTaskUpdate(payload, taskSnapshotFromRow(row));
  } catch {
    return jsonResponse({ error: "invalid_task_state" }, 400);
  }

  try {
    await env.AMBIENT_DB.prepare(
      `INSERT INTO task_state (id, entity_id, items_json, updated_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        entity_id = excluded.entity_id,
        items_json = excluded.items_json,
        updated_at = excluded.updated_at`,
    )
      .bind(snapshot.entityId, JSON.stringify(snapshot.items), Date.parse(snapshot.updatedAt))
      .run();

    return jsonResponse(taskStateFromSnapshot(snapshot), 200);
  } catch {
    return jsonResponse({ error: "task_update_failed" }, 503);
  }
}
