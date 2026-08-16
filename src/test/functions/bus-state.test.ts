// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { HIGH_WYCOMBE_STOP } from "../../lib/bus";
import {
  fetchBusState,
  normaliseBustimesFleet,
  onRequestGet,
} from "../../../functions/api/bus-state";

const xml = `<?xml version="1.0"?>
  <Siri><ServiceDelivery><VehicleMonitoringDelivery><VehicleActivity>
    <RecordedAtTime>2026-08-03T08:09:50+01:00</RecordedAtTime>
    <MonitoredVehicleJourney>
      <LineRef>37</LineRef><PublishedLineName>37</PublishedLineName>
      <OperatorRef>CSLB</OperatorRef><DirectionRef>outbound</DirectionRef>
      <OriginRef>${HIGH_WYCOMBE_STOP.stopId}</OriginRef>
      <DestinationRef>035000000001</DestinationRef>
      <DestinationName>Windsor Town Centre</DestinationName>
      <VehicleRef>CSLB-80456</VehicleRef>
      <VehicleLocation><Longitude>${HIGH_WYCOMBE_STOP.longitude}</Longitude><Latitude>${HIGH_WYCOMBE_STOP.latitude}</Latitude></VehicleLocation>
      <Bearing>112</Bearing>
    </MonitoredVehicleJourney>
  </VehicleActivity></VehicleMonitoringDelivery></ServiceDelivery></Siri>`;

const bustimesFleet = {
  results: [
    {
      fleet_code: "80456",
      livery: {
        id: 3384,
        name: "Carousel Country",
        left: "linear-gradient(60deg,#ee1d23 35%,#94111e 35%)",
        right: "linear-gradient(300deg,#ee1d23 35%,#94111e 35%)",
      },
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Cloudflare bus-state function", () => {
  it("serves deterministic scenarios without an API key in mock mode", async () => {
    const state = await fetchBusState(
      { BUS_MOCK: "true", BUS_MOCK_SCENARIO: "inbound" },
      fetch,
      100,
      new Date("2026-08-03T07:10:00Z"),
    );
    expect(state.phase).toBe("approaching_station");
    expect(state.service.line).toBe("37");
  });

  it("fetches and normalises the filtered BODS feed without exposing the key", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === "bustimes.org") {
        expect(url.searchParams.get("operator")).toBe("CSLB");
        expect(url.searchParams.get("limit")).toBe("1000");
        return Response.json(bustimesFleet);
      }
      expect(url.searchParams.get("operatorRef")).toBe("CSLB");
      expect(url.searchParams.get("lineRef")).toBe("37");
      expect(url.searchParams.get("api_key")).toBe("top-secret");
      return new Response(xml, { status: 200 });
    });
    const state = await fetchBusState(
      { BODS_API_KEY: "top-secret" },
      fetcher as typeof fetch,
      100,
      new Date("2026-08-03T07:10:00Z"),
    );
    expect(state.phase).toBe("at_station");
    expect(state.routeVehicles[0]?.livery).toEqual({
      id: 3384,
      name: "Carousel Country",
      colours: ["#ee1d23", "#94111e"],
      angleDegrees: 60,
    });
    expect(JSON.stringify(state)).not.toContain("top-secret");
  });

  it("normalises safe livery data without returning raw Bustimes CSS", () => {
    const lookup = normaliseBustimesFleet({
      results: [
        {
          fleet_code: 80456,
          livery: {
            id: "not-an-id",
            name: "  Carousel\u0000  Country  ",
            left:
              "linear-gradient(-60deg,#abc,#12345678,url(javascript:alert(1)),#GGG)",
            right: "linear-gradient(420deg,#DEF,#010203,#040506,#070809,#101112)",
          },
        },
        {
          fleet_code: "no-colours",
          livery: { id: 4, name: "Unsafe", left: "url(javascript:alert(1))" },
        },
      ],
    });

    expect(lookup["80456"]).toEqual({
      id: null,
      name: "Carousel Country",
      colours: [
        "#aabbcc",
        "#123456",
        "#ddeeff",
        "#010203",
        "#040506",
        "#070809",
      ],
      angleDegrees: 300,
    });
    expect(lookup["NO-COLOURS"]).toBeUndefined();
    expect(JSON.stringify(lookup)).not.toContain("javascript");
    expect(JSON.stringify(lookup)).not.toContain("linear-gradient");
  });

  it("caches normalized Bustimes fleet metadata for 24 hours", async () => {
    let fleetCache: Response | undefined;
    const cache = {
      match: vi.fn(async () => fleetCache?.clone()),
      put: vi.fn(async (_request: Request, response: Response) => {
        fleetCache = response.clone();
      }),
    };
    vi.stubGlobal("caches", { default: cache });
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return url.hostname === "bustimes.org"
        ? Response.json(bustimesFleet)
        : new Response(xml);
    });

    const now = new Date("2026-08-03T07:10:00Z");
    const first = await fetchBusState(
      { BODS_API_KEY: "secret" },
      fetcher as typeof fetch,
      100,
      now,
    );
    const second = await fetchBusState(
      { BODS_API_KEY: "secret" },
      fetcher as typeof fetch,
      100,
      now,
    );

    expect(first.routeVehicles[0]?.livery).toEqual(second.routeVehicles[0]?.livery);
    expect(
      fetcher.mock.calls.filter(([input]) =>
        String(input).startsWith("https://bustimes.org/"),
      ),
    ).toHaveLength(1);
    expect(cache.put).toHaveBeenCalledOnce();
    expect(cache.put.mock.calls[0][1].headers.get("Cache-Control")).toBe(
      "public, max-age=86400",
    );
  });

  it("keeps live bus positions available when Bustimes rejects enrichment", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return url.hostname === "bustimes.org"
        ? new Response("unavailable", { status: 503 })
        : new Response(xml);
    });
    const state = await fetchBusState(
      { BODS_API_KEY: "secret" },
      fetcher as typeof fetch,
      100,
      new Date("2026-08-03T07:10:00Z"),
    );

    expect(state.status).toBe("ready");
    expect(state.routeVehicles[0]?.livery).toBeNull();
  });

  it("keeps live positions available when Bustimes exceeds its timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(
        (input: string | URL | Request, init?: RequestInit) => {
          const url = new URL(String(input));
          if (url.hostname !== "bustimes.org") {
            return Promise.resolve(new Response(xml));
          }
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          });
        },
      );
      const pending = fetchBusState(
        { BODS_API_KEY: "secret" },
        fetcher as typeof fetch,
        8_000,
        new Date("2026-08-03T07:10:00Z"),
      );

      await vi.advanceTimersByTimeAsync(3_000);
      const state = await pending;

      expect(state.status).toBe("ready");
      expect(state.routeVehicles[0]?.livery).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts BODS after the configured timeout", async () => {
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
    );
    await expect(
      fetchBusState({ BODS_API_KEY: "secret" }, fetcher as typeof fetch, 5),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns a sanitised error for rejected or malformed provider data", async () => {
    const cache = {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
    };
    vi.stubGlobal("caches", { default: cache });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 401 })));
    const response = await onRequestGet({
      request: new Request("https://clock.example/api/bus-state"),
      env: { BODS_API_KEY: "never-return-this" },
      waitUntil: vi.fn(),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "bus_unavailable" });
  });

  it("uses a canonical ten-second edge cache", async () => {
    const cachedResponse = Response.json({ cached: true });
    const cache = {
      match: vi.fn(async (_request: Request) => cachedResponse),
      put: vi.fn(async (_request: Request, _response: Response) => undefined),
    };
    vi.stubGlobal("caches", { default: cache });
    const response = await onRequestGet({
      request: new Request("https://clock.example/api/bus-state?ignored=yes"),
      env: { BODS_API_KEY: "secret" },
      waitUntil: vi.fn(),
    });
    expect(await response.json()).toEqual({ cached: true });
    expect((cache.match.mock.calls[0][0] as Request).url).toBe(
      "https://clock.example/api/bus-state",
    );
  });

  it("caches a successful live response", async () => {
    const cache = {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
    };
    vi.stubGlobal("caches", { default: cache });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml)));
    const backgroundTasks: Promise<unknown>[] = [];
    const response = await onRequestGet({
      request: new Request("https://clock.example/api/bus-state"),
      env: { BODS_API_KEY: "secret" },
      waitUntil: (promise) => backgroundTasks.push(promise),
    });
    await Promise.all(backgroundTasks);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("max-age=10");
    expect(cache.put).toHaveBeenCalledOnce();
  });
});
