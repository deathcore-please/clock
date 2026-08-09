import {
  neutralAmbientLight,
  type AmbientLightState,
  type AmbientThemeMode,
} from "../types/dashboard";

export const AMBIENT_ENTITY_ID = "light.wipro_rgbcw_12_5w_bulb";
export const AMBIENT_STALE_AFTER_MS = 15 * 60 * 1_000;

const VALID_BULB_STATES = new Set(["on", "off", "unavailable", "unknown"]);

export interface AmbientDatabaseRow {
  available: number;
  is_on: number;
  mode: string;
  red: number;
  green: number;
  blue: number;
  brightness: number;
  updated_at: number;
}

interface AmbientUpdatePayload {
  entity_id?: unknown;
  state?: unknown;
  color_mode?: unknown;
  rgb_color?: unknown;
  brightness?: unknown;
  color_temp_kelvin?: unknown;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function parseRgb(value: unknown): [number, number, number] | null {
  if (value === null || value === undefined) return null;
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some(
      (channel) =>
        typeof channel !== "number" ||
        !Number.isFinite(channel) ||
        channel < 0 ||
        channel > 255,
    )
  ) {
    throw new Error("rgb_color must contain three values between 0 and 255");
  }

  return value.map((channel) => Math.round(channel)) as [number, number, number];
}

function hasNegligibleSaturation([red, green, blue]: [number, number, number]): boolean {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  return maximum === 0 || (maximum - minimum) / maximum <= 0.05;
}

function normaliseBrightness(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 255
  ) {
    throw new Error("brightness must be between 0 and 255");
  }
  return Math.round(value);
}

export function normaliseAmbientUpdate(
  input: unknown,
  now = Date.now(),
): AmbientLightState {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("The request body must be a JSON object");
  }

  const payload = input as AmbientUpdatePayload;
  if (payload.entity_id !== AMBIENT_ENTITY_ID) {
    throw new Error("Unexpected entity_id");
  }
  if (typeof payload.state !== "string" || !VALID_BULB_STATES.has(payload.state)) {
    throw new Error("Invalid bulb state");
  }
  if (!isNullableString(payload.color_mode ?? null)) {
    throw new Error("color_mode must be a string or null");
  }
  if (!isNullableFiniteNumber(payload.color_temp_kelvin ?? null)) {
    throw new Error("color_temp_kelvin must be a number or null");
  }

  const updatedAt = new Date(now).toISOString();
  const brightness = normaliseBrightness(payload.brightness);
  const rgb = parseRgb(payload.rgb_color);

  if (payload.state !== "on") {
    return {
      available: payload.state === "off",
      on: false,
      mode: "neutral",
      rgb: [255, 255, 255],
      brightness,
      updatedAt,
    };
  }

  const whiteMode =
    payload.color_mode === "color_temp" || (rgb !== null && hasNegligibleSaturation(rgb));
  if (whiteMode) {
    return {
      available: true,
      on: true,
      mode: "white",
      rgb: [255, 255, 255],
      brightness,
      updatedAt,
    };
  }
  if (rgb === null) {
    throw new Error("An on bulb in colour mode requires rgb_color");
  }

  return {
    available: true,
    on: true,
    mode: "colour",
    rgb,
    brightness,
    updatedAt,
  };
}

function validMode(value: string): value is AmbientThemeMode {
  return value === "neutral" || value === "white" || value === "colour";
}

export function ambientStateFromRow(
  row: AmbientDatabaseRow | null,
  now = Date.now(),
): AmbientLightState {
  if (!row || now - row.updated_at > AMBIENT_STALE_AFTER_MS) {
    return { ...neutralAmbientLight };
  }

  const rgb: [number, number, number] = [row.red, row.green, row.blue];
  if (
    !validMode(row.mode) ||
    !rgb.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255) ||
    !Number.isInteger(row.brightness) ||
    row.brightness < 0 ||
    row.brightness > 255
  ) {
    return { ...neutralAmbientLight };
  }

  return {
    available: row.available === 1,
    on: row.is_on === 1,
    mode: row.mode,
    rgb,
    brightness: row.brightness,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function ambientStateToDatabaseValues(state: AmbientLightState) {
  if (state.updatedAt === null) {
    throw new Error("A persisted ambient state requires updatedAt");
  }
  return [
    state.available ? 1 : 0,
    state.on ? 1 : 0,
    state.mode,
    ...state.rgb,
    state.brightness,
    Date.parse(state.updatedAt),
  ] as const;
}
