// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { HIGH_WYCOMBE_STOP } from "../../lib/bus";
import { fetchBusState, onRequestGet } from "../../../functions/api/bus-state";

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
    expect(JSON.stringify(state)).not.toContain("top-secret");
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
