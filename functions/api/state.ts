import { createMockDashboardState } from "../../src/mocks/dashboard";
import { normaliseOpenWeather } from "../../src/lib/weather";

interface Env {
  OPENWEATHER_API_KEY?: string;
  WEATHER_LAT?: string;
  WEATHER_LON?: string;
  WEATHER_LOCATION_NAME?: string;
  DISPLAY_TIMEZONE?: string;
  WEATHER_UNITS?: string;
  WEATHER_MOCK?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
}

type Fetcher = typeof fetch;

const CACHE_SECONDS = 600;
const UPSTREAM_TIMEOUT_MS = 8_000;

function jsonResponse(body: unknown, status = 200, cacheControl = "no-store"): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function requiredEnvironment(env: Env) {
  const latitude = Number(env.WEATHER_LAT);
  const longitude = Number(env.WEATHER_LON);
  const units = env.WEATHER_UNITS || "metric";
  if (
    !env.OPENWEATHER_API_KEY ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !env.WEATHER_LOCATION_NAME ||
    units !== "metric"
  ) {
    throw new Error("Weather configuration is incomplete");
  }

  return {
    apiKey: env.OPENWEATHER_API_KEY,
    latitude,
    longitude,
    locationName: env.WEATHER_LOCATION_NAME,
    timezone: env.DISPLAY_TIMEZONE || "Europe/London",
    units,
  };
}

async function responseJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error("Weather provider rejected the request");
  }
  return response.json();
}

export async function fetchDashboardState(
  env: Env,
  fetcher: Fetcher = fetch,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
) {
  if (env.WEATHER_MOCK === "true") {
    return createMockDashboardState();
  }

  const configuration = requiredEnvironment(env);
  const query = new URLSearchParams({
    lat: String(configuration.latitude),
    lon: String(configuration.longitude),
    appid: configuration.apiKey,
    units: configuration.units,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const [currentResponse, forecastResponse] = await Promise.all([
      fetcher(`https://api.openweathermap.org/data/2.5/weather?${query}`, {
        signal: controller.signal,
      }),
      fetcher(`https://api.openweathermap.org/data/2.5/forecast?${query}`, {
        signal: controller.signal,
      }),
    ]);
    const [current, forecast] = await Promise.all([
      responseJson(currentResponse),
      responseJson(forecastResponse),
    ]);

    return normaliseOpenWeather(
      current,
      forecast,
      {
        locationName: configuration.locationName,
        timezone: configuration.timezone,
      },
      new Date(),
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const requestUrl = new URL(context.request.url);
  const canonicalCacheKey = new Request(`${requestUrl.origin}/api/state`);
  const edgeCache = (caches as CacheStorage & { default: Cache }).default;

  if (context.env.WEATHER_MOCK !== "true") {
    const cached = await edgeCache.match(canonicalCacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const state = await fetchDashboardState(context.env);
    const response = jsonResponse(
      state,
      200,
      `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=3600`,
    );

    if (context.env.WEATHER_MOCK !== "true") {
      context.waitUntil(edgeCache.put(canonicalCacheKey, response.clone()));
    }
    return response;
  } catch {
    return jsonResponse({ error: "weather_unavailable" }, 502);
  }
}
