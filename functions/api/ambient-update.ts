import {
  ambientStateToDatabaseValues,
  normaliseAmbientUpdate,
} from "../../src/lib/ambient-state";
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

  let state;
  try {
    state = normaliseAmbientUpdate(payload);
  } catch {
    return jsonResponse({ error: "invalid_ambient_state" }, 400);
  }

  try {
    const values = ambientStateToDatabaseValues(state);
    await env.AMBIENT_DB.prepare(
      `INSERT INTO ambient_state
        (id, available, is_on, mode, red, green, blue, brightness, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        available = excluded.available,
        is_on = excluded.is_on,
        mode = excluded.mode,
        red = excluded.red,
        green = excluded.green,
        blue = excluded.blue,
        brightness = excluded.brightness,
        updated_at = excluded.updated_at`,
    )
      .bind(...values)
      .run();

    return jsonResponse(state, 200);
  } catch {
    return jsonResponse({ error: "ambient_update_failed" }, 503);
  }
}
