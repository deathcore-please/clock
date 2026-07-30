// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDashboardState, onRequestGet } from "./state";

function providerPayload(now: Date) {
  const start = Math.floor(now.getTime() / 1000);
  return {
    current: {
      dt: start,
      main: {
        temp: 16,
        feels_like: 15,
        humidity: 70,
        temp_max: 18,
        temp_min: 11,
      },
      wind: { speed: 3 },
      weather: [{ id: 800, description: "clear sky" }],
    },
    forecast: {
      list: Array.from({ length: 8 }, (_, index) => ({
        dt: start + (index + 1) * 10_800,
        main: { temp: 16 - index / 2 },
        pop: 0.1,
        weather: [{ id: 800, description: "clear sky" }],
      })),
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Cloudflare state function", () => {
  it("fetches and normalises both OpenWeather endpoints", async () => {
    const payload = providerPayload(new Date());
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return Response.json(url.includes("/weather?") ? payload.current : payload.forecast);
    });

    const state = await fetchDashboardState(
      {
        OPENWEATHER_API_KEY: "secret",
        WEATHER_LAT: "51.5",
        WEATHER_LON: "-0.1",
        WEATHER_LOCATION_NAME: "London",
        DISPLAY_TIMEZONE: "Europe/London",
      },
      fetcher as typeof fetch,
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(state.weather.forecast).toHaveLength(8);
    expect(JSON.stringify(state)).not.toContain("secret");
  });

  it("aborts an upstream request after the configured timeout", async () => {
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    });

    await expect(
      fetchDashboardState(
        {
          OPENWEATHER_API_KEY: "secret",
          WEATHER_LAT: "51.5",
          WEATHER_LON: "-0.1",
          WEATHER_LOCATION_NAME: "London",
        },
        fetcher as typeof fetch,
        5,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns a sanitised error when the provider rejects the request", async () => {
    const cache = {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
    };
    vi.stubGlobal("caches", { default: cache });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 401 })));

    const response = await onRequestGet({
      request: new Request("https://clock.example/api/state?bypass=1"),
      env: {
        OPENWEATHER_API_KEY: "do-not-expose",
        WEATHER_LAT: "51.5",
        WEATHER_LON: "-0.1",
        WEATHER_LOCATION_NAME: "London",
      },
      waitUntil: vi.fn(),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "weather_unavailable" });
  });

  it("serves and caches mock-free successful responses under a canonical key", async () => {
    const cachedResponse = Response.json({ cached: true });
    const cache = {
      match: vi.fn(async (_request: Request) => cachedResponse),
      put: vi.fn(async (_request: Request, _response: Response) => undefined),
    };
    vi.stubGlobal("caches", { default: cache });

    const response = await onRequestGet({
      request: new Request("https://clock.example/api/state?ignored=yes"),
      env: {
        OPENWEATHER_API_KEY: "secret",
        WEATHER_LAT: "51.5",
        WEATHER_LON: "-0.1",
        WEATHER_LOCATION_NAME: "London",
      },
      waitUntil: vi.fn(),
    });

    expect(await response.json()).toEqual({ cached: true });
    expect((cache.match.mock.calls[0][0] as Request).url).toBe(
      "https://clock.example/api/state",
    );
  });

  it("places a successful provider response in the canonical edge cache", async () => {
    const payload = providerPayload(new Date());
    const cache = {
      match: vi.fn(async (_request: Request) => undefined),
      put: vi.fn(async (_request: Request, _response: Response) => undefined),
    };
    vi.stubGlobal("caches", { default: cache });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) =>
        Response.json(
          String(input).includes("/weather?") ? payload.current : payload.forecast,
        ),
      ),
    );
    const backgroundTasks: Promise<unknown>[] = [];

    const response = await onRequestGet({
      request: new Request("https://clock.example/api/state?ignored=yes"),
      env: {
        OPENWEATHER_API_KEY: "secret",
        WEATHER_LAT: "51.5",
        WEATHER_LON: "-0.1",
        WEATHER_LOCATION_NAME: "London",
      },
      waitUntil: (promise) => backgroundTasks.push(promise),
    });
    await Promise.all(backgroundTasks);

    expect(response.status).toBe(200);
    expect(cache.put).toHaveBeenCalledOnce();
    expect((cache.put.mock.calls[0][0] as Request).url).toBe(
      "https://clock.example/api/state",
    );
  });
});
