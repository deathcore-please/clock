// @vitest-environment node
import { describe, expect, it } from "vitest";
import { onRequestGet } from "../../../functions/api/ambient-state";
import { onRequestPost } from "../../../functions/api/ambient-update";
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
} from "../../../functions/api/ambient-types";
import {
  AMBIENT_ENTITY_ID,
  AMBIENT_STALE_AFTER_MS,
  normaliseAmbientUpdate,
  type AmbientDatabaseRow,
} from "../../lib/ambient-state";

const SECRET = "test-webhook-secret";

class MemoryD1 implements D1DatabaseLike {
  row: AmbientDatabaseRow | null = null;
  runCount = 0;

  prepare(query: string): D1PreparedStatementLike {
    let values: unknown[] = [];
    const statement: D1PreparedStatementLike = {
      bind: (...nextValues) => {
        values = nextValues;
        return statement;
      },
      first: async <T>() => this.row as T | null,
      run: async () => {
        if (!query.includes("INSERT INTO ambient_state")) throw new Error("Unexpected SQL");
        const [available, isOn, mode, red, green, blue, brightness, updatedAt] = values;
        this.row = {
          available: Number(available),
          is_on: Number(isOn),
          mode: String(mode),
          red: Number(red),
          green: Number(green),
          blue: Number(blue),
          brightness: Number(brightness),
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
  return new Request("https://clock.example/api/ambient-update", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function colourPayload(overrides: Record<string, unknown> = {}) {
  return {
    entity_id: AMBIENT_ENTITY_ID,
    state: "on",
    color_mode: "hs",
    rgb_color: [255, 3, 3],
    brightness: 255,
    color_temp_kelvin: null,
    ...overrides,
  };
}

describe("ambient update function", () => {
  it("rejects missing or incorrect bearer authentication", async () => {
    const database = new MemoryD1();
    const response = await onRequestPost({
      request: updateRequest(colourPayload(), "wrong"),
      env: { AMBIENT_DB: database, AMBIENT_WEBHOOK_SECRET: SECRET },
    });
    expect(response.status).toBe(401);
    expect(database.runCount).toBe(0);
  });

  it("rejects malformed payloads and any other entity", async () => {
    const database = new MemoryD1();
    const malformed = await onRequestPost({
      request: updateRequest(colourPayload({ rgb_color: [256, 0, 0] })),
      env: { AMBIENT_DB: database, AMBIENT_WEBHOOK_SECRET: SECRET },
    });
    const wrongEntity = await onRequestPost({
      request: updateRequest(colourPayload({ entity_id: "light.some_other_bulb" })),
      env: { AMBIENT_DB: database, AMBIENT_WEBHOOK_SECRET: SECRET },
    });
    expect(malformed.status).toBe(400);
    expect(wrongEntity.status).toBe(400);
    expect(database.runCount).toBe(0);
  });

  it("normalises and upserts the current bulb state into the single row", async () => {
    const database = new MemoryD1();
    const firstResponse = await onRequestPost({
      request: updateRequest(colourPayload({ rgb_color: [12, 34, 56], brightness: 7 })),
      env: { AMBIENT_DB: database, AMBIENT_WEBHOOK_SECRET: SECRET },
    });
    const secondResponse = await onRequestPost({
      request: updateRequest(colourPayload({ rgb_color: [90, 80, 70], brightness: 4 })),
      env: { AMBIENT_DB: database, AMBIENT_WEBHOOK_SECRET: SECRET },
    });
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(database.runCount).toBe(2);
    expect(database.row).toMatchObject({
      available: 1,
      is_on: 1,
      mode: "colour",
      red: 90,
      green: 80,
      blue: 70,
      brightness: 4,
    });
  });

  it("classifies colour temperature and low-saturation RGB as white", () => {
    expect(
      normaliseAmbientUpdate(colourPayload({ color_mode: "color_temp", rgb_color: null })).mode,
    ).toBe("white");
    expect(normaliseAmbientUpdate(colourPayload({ rgb_color: [250, 248, 247] })).mode).toBe(
      "white",
    );
  });
});

describe("ambient state function", () => {
  it("returns the current row without edge or browser caching", async () => {
    const database = new MemoryD1();
    await onRequestPost({
      request: updateRequest(colourPayload({ rgb_color: [1, 2, 3] })),
      env: { AMBIENT_DB: database, AMBIENT_WEBHOOK_SECRET: SECRET },
    });
    const response = await onRequestGet({ env: { AMBIENT_DB: database } });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      available: true,
      on: true,
      mode: "colour",
      rgb: [1, 2, 3],
    });
  });

  it("returns neutral state when no row exists or the heartbeat is stale", async () => {
    const database = new MemoryD1();
    const empty = await onRequestGet({ env: { AMBIENT_DB: database } });
    expect(await empty.json()).toMatchObject({ available: false, on: false, mode: "neutral" });

    database.row = {
      available: 1,
      is_on: 1,
      mode: "colour",
      red: 255,
      green: 0,
      blue: 0,
      brightness: 255,
      updated_at: Date.now() - AMBIENT_STALE_AFTER_MS - 1,
    };
    const stale = await onRequestGet({ env: { AMBIENT_DB: database } });
    expect(await stale.json()).toMatchObject({ available: false, on: false, mode: "neutral" });
  });
});
