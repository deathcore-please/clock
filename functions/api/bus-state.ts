import { normaliseSiriVm } from "../../src/lib/bus";
import { createMockBusState } from "../../src/mocks/bus";
import type { BusLivery, BusMockScenario, BusState } from "../../src/types/bus";

interface Env {
  BODS_API_KEY?: string;
  BODS_API_URL?: string;
  BUS_MOCK?: string;
  BUS_MOCK_SCENARIO?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}

type Fetcher = typeof fetch;

const CACHE_SECONDS = 10;
const UPSTREAM_TIMEOUT_MS = 8_000;
const BUSTIMES_TIMEOUT_MS = 3_000;
const BUSTIMES_CACHE_SECONDS = 24 * 60 * 60;
const DEFAULT_BODS_API_URL = "https://data.bus-data.dft.gov.uk/api/v1/datafeed/";
const BUSTIMES_FLEET_URL =
  "https://bustimes.org/api/vehicles/?operator=CSLB&limit=1000";
const BUSTIMES_CACHE_KEY = new Request(BUSTIMES_FLEET_URL);
const MAX_LIVERY_COLOURS = 6;
const scenarios = new Set<BusMockScenario>([
  "station",
  "outbound",
  "inbound",
  "stale",
  "untracked",
]);

type UnknownRecord = Record<string, unknown>;
type LiveryLookup = Record<string, BusLivery>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function normaliseHexColour(value: string): string | null {
  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (!match) return null;

  const digits = match[1].toLowerCase();
  if (digits.length === 3 || digits.length === 4) {
    return `#${digits
      .slice(0, 3)
      .split("")
      .map((digit) => digit.repeat(2))
      .join("")}`;
  }
  return `#${digits.slice(0, 6)}`;
}

function coloursFromCss(...values: unknown[]): string[] {
  const colours: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;
    for (const match of value.matchAll(
      /#[0-9a-f]{8}(?![0-9a-f])|#[0-9a-f]{6}(?![0-9a-f])|#[0-9a-f]{4}(?![0-9a-f])|#[0-9a-f]{3}(?![0-9a-f])/gi,
    )) {
      const colour = normaliseHexColour(match[0]);
      if (!colour || seen.has(colour)) continue;
      seen.add(colour);
      colours.push(colour);
      if (colours.length === MAX_LIVERY_COLOURS) return colours;
    }
  }

  return colours;
}

function gradientAngle(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const match = /linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,/i.exec(value);
    if (!match) continue;
    const angle = Number(match[1]);
    if (Number.isFinite(angle)) return ((angle % 360) + 360) % 360;
  }
  return 90;
}

function normaliseLiveryName(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .split("")
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || (code >= 127 && code <= 159) ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseLivery(value: unknown): BusLivery | null {
  const source = record(value);
  const colours = coloursFromCss(source.left, source.right);
  if (colours.length === 0) return null;

  const id = typeof source.id === "number" ? source.id : null;
  const rawName = normaliseLiveryName(source.name);
  return {
    id: id !== null && Number.isSafeInteger(id) && id >= 0 ? id : null,
    name: rawName ? rawName.slice(0, 120) : null,
    colours,
    angleDegrees: gradientAngle(source.left, source.right),
  };
}

export function normaliseBustimesFleet(value: unknown): LiveryLookup {
  const results = record(value).results;
  if (!Array.isArray(results)) return {};

  const lookup: LiveryLookup = {};
  for (const result of results) {
    const vehicle = record(result);
    const fleetCode =
      typeof vehicle.fleet_code === "string" ||
      typeof vehicle.fleet_code === "number"
        ? String(vehicle.fleet_code).trim().toUpperCase()
        : "";
    const livery = normaliseLivery(vehicle.livery);
    if (fleetCode && livery && !lookup[fleetCode]) lookup[fleetCode] = livery;
  }
  return lookup;
}

function availableEdgeCache(): Cache | null {
  return typeof caches === "undefined"
    ? null
    : (caches as CacheStorage & { default: Cache }).default;
}

async function fetchLiveryLookup(fetcher: Fetcher): Promise<LiveryLookup> {
  const edgeCache = availableEdgeCache();
  if (edgeCache) {
    try {
      const cached = await edgeCache.match(BUSTIMES_CACHE_KEY);
      if (cached) return normaliseBustimesFleet(await cached.json());
    } catch {
      // A livery cache failure must not affect live bus tracking.
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BUSTIMES_TIMEOUT_MS);
  try {
    const response = await fetcher(BUSTIMES_FLEET_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "clock-dashboard/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) return {};

    const lookup = normaliseBustimesFleet(await response.json());
    if (edgeCache) {
      try {
        await edgeCache.put(
          BUSTIMES_CACHE_KEY,
          Response.json({
            results: Object.entries(lookup).map(([fleet_code, livery]) => ({
              fleet_code,
              livery: {
                id: livery.id,
                name: livery.name,
                left: `linear-gradient(${livery.angleDegrees}deg,${livery.colours.join(",")})`,
                right: "",
              },
            })),
          }, {
            headers: {
              "Cache-Control": `public, max-age=${BUSTIMES_CACHE_SECONDS}`,
              "Content-Type": "application/json; charset=utf-8",
            },
          }),
        );
      } catch {
        // The normalized response can still be used when the cache write fails.
      }
    }
    return lookup;
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

function fleetCode(vehicleId: string): string | null {
  const match = /^CSLB-(.+)$/i.exec(vehicleId.trim());
  return match?.[1]?.trim().toUpperCase() || null;
}

function applyLiveries(state: BusState, lookup: LiveryLookup): BusState {
  return {
    ...state,
    routeVehicles: state.routeVehicles.map((vehicle) => {
      const code = fleetCode(vehicle.id);
      return { ...vehicle, livery: code ? lookup[code] ?? null : null };
    }),
  };
}

function mockScenario(value: string | null | undefined): BusMockScenario {
  return value && scenarios.has(value as BusMockScenario)
    ? (value as BusMockScenario)
    : "station";
}

function jsonResponse(body: unknown, status = 200, cacheControl = "no-store") {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export async function fetchBusState(
  env: Env,
  fetcher: Fetcher = fetch,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
  now = new Date(),
  requestedScenario?: string | null,
) {
  if (env.BUS_MOCK === "true") {
    return createMockBusState(
      mockScenario(requestedScenario || env.BUS_MOCK_SCENARIO),
      now,
    );
  }
  if (!env.BODS_API_KEY) throw new Error("Bus configuration is incomplete");

  const url = new URL(env.BODS_API_URL || DEFAULT_BODS_API_URL);
  url.searchParams.set("api_key", env.BODS_API_KEY);
  url.searchParams.set("operatorRef", "CSLB");
  url.searchParams.set("lineRef", "37");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(url, {
      headers: { Accept: "application/xml, text/xml;q=0.9" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Bus provider rejected the request");
    const state = normaliseSiriVm(await response.text(), now);
    if (state.routeVehicles.length === 0) return state;
    return applyLiveries(state, await fetchLiveryLookup(fetcher));
  } finally {
    clearTimeout(timeout);
  }
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const requestUrl = new URL(context.request.url);
  const scenario = requestUrl.searchParams.get("scenario");
  const isMock = context.env.BUS_MOCK === "true";
  const canonicalCacheKey = new Request(`${requestUrl.origin}/api/bus-state`);
  const edgeCache = (caches as CacheStorage & { default: Cache }).default;

  if (!isMock) {
    const cached = await edgeCache.match(canonicalCacheKey);
    if (cached) return cached;
  }

  try {
    const state = await fetchBusState(
      context.env,
      fetch,
      UPSTREAM_TIMEOUT_MS,
      new Date(),
      scenario,
    );
    const response = jsonResponse(
      state,
      200,
      `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=30`,
    );
    if (!isMock) {
      context.waitUntil(edgeCache.put(canonicalCacheKey, response.clone()));
    }
    return response;
  } catch {
    return jsonResponse({ error: "bus_unavailable" }, 502);
  }
}
