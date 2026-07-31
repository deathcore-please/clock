import { normaliseSiriVm } from "../../src/lib/bus";
import { createMockBusState } from "../../src/mocks/bus";
import type { BusMockScenario } from "../../src/types/bus";

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
const DEFAULT_BODS_API_URL = "https://data.bus-data.dft.gov.uk/api/v1/datafeed/";
const scenarios = new Set<BusMockScenario>([
  "station",
  "outbound",
  "inbound",
  "stale",
  "untracked",
]);

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
    return normaliseSiriVm(await response.text(), now);
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
