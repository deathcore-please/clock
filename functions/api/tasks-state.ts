import {
  taskSnapshotFromRow,
  taskStateFromSnapshot,
  type TaskDatabaseRow,
} from "../../src/lib/task-state";
import type { D1DatabaseLike } from "./ambient-types";

interface Env {
  AMBIENT_DB: D1DatabaseLike;
}

interface PagesContext {
  env: Env;
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export async function onRequestGet({ env }: PagesContext): Promise<Response> {
  try {
    const row = await env.AMBIENT_DB.prepare(
      `SELECT entity_id, items_json, updated_at
       FROM task_state WHERE id = 1`,
    ).first<TaskDatabaseRow>();
    return jsonResponse(taskStateFromSnapshot(taskSnapshotFromRow(row)));
  } catch {
    return jsonResponse({ status: "unavailable", updatedAt: null, items: [] }, 503);
  }
}
