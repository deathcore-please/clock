import {
  ambientStateFromRow,
  type AmbientDatabaseRow,
} from "../../src/lib/ambient-state";
import type { D1DatabaseLike } from "./ambient-types";

interface Env {
  AMBIENT_DB: D1DatabaseLike;
}

interface PagesContext {
  env: Env;
}

export async function onRequestGet({ env }: PagesContext): Promise<Response> {
  try {
    const row = await env.AMBIENT_DB.prepare(
      `SELECT available, is_on, mode, red, green, blue, brightness, updated_at
       FROM ambient_state WHERE id = 1`,
    ).first<AmbientDatabaseRow>();
    return Response.json(ambientStateFromRow(row), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch {
    return Response.json({ error: "ambient_state_unavailable" }, {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }
}
