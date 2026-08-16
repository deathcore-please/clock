import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const leafletMocks = vi.hoisted(() => {
  const routeLayer = { addTo: vi.fn() };
  routeLayer.addTo.mockReturnValue(routeLayer);
  const tileLayer = { addTo: vi.fn() };
  tileLayer.addTo.mockReturnValue(tileLayer);
  const markerInstances: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
  const attributionControl = { addAttribution: vi.fn() };
  const mapInstance = {
    attributionControl,
    fitBounds: vi.fn(),
    getZoom: vi.fn(() => 14),
    invalidateSize: vi.fn(),
    panTo: vi.fn(),
    remove: vi.fn(),
    setZoom: vi.fn(),
  };

  return {
    attributionControl,
    divIcon: vi.fn((options: Record<string, unknown>) => options),
    geoJSON: vi.fn(
      (
        _geometry: unknown,
        _options: { interactive: boolean; style: Record<string, unknown> },
      ) => routeLayer,
    ),
    latLng: vi.fn((latitude: number, longitude: number) => ({ latitude, longitude })),
    latLngBounds: vi.fn((points: unknown) => ({ points })),
    map: vi.fn(() => mapInstance),
    mapInstance,
    marker: vi.fn((_coordinates: unknown, _options?: Record<string, unknown>) => {
      const marker = {
        addTo: vi.fn(),
        remove: vi.fn(),
        setIcon: vi.fn(),
        setLatLng: vi.fn(),
        setZIndexOffset: vi.fn(),
      };
      marker.addTo.mockReturnValue(marker);
      marker.setIcon.mockReturnValue(marker);
      marker.setLatLng.mockReturnValue(marker);
      markerInstances.push(marker);
      return marker;
    }),
    markerInstances,
    routeLayer,
    tileLayer: vi.fn(() => tileLayer),
  };
});

vi.mock("leaflet", () => ({
  default: {
    divIcon: leafletMocks.divIcon,
    geoJSON: leafletMocks.geoJSON,
    latLng: leafletMocks.latLng,
    latLngBounds: leafletMocks.latLngBounds,
    map: leafletMocks.map,
    marker: leafletMocks.marker,
    tileLayer: leafletMocks.tileLayer,
  },
}));

import {
  addRouteGeometryLayer,
  BusMap,
  formatBusMarkerAge,
  vehicleIcon,
} from "./BusMap";
import { createMockBusState } from "../mocks/bus";
import type { RouteBusVehicle } from "../types/bus";

beforeEach(() => {
  vi.clearAllMocks();
  leafletMocks.markerInstances.length = 0;
});

describe("BusMap route geometry", () => {
  it("adds one solid, non-interactive route layer across position updates", () => {
    const initialState = createMockBusState("outbound");
    const { rerender } = render(<BusMap state={initialState} />);

    expect(leafletMocks.geoJSON).toHaveBeenCalledOnce();
    const [, options] = leafletMocks.geoJSON.mock.calls[0];
    expect(options).toMatchObject({
      interactive: false,
      style: {
        color: "#f7f7f4",
        weight: 3,
        opacity: 0.75,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      },
    });
    expect(options.style).not.toHaveProperty("dashArray");
    expect(leafletMocks.routeLayer.addTo).toHaveBeenCalledWith(
      leafletMocks.mapInstance,
    );
    expect(leafletMocks.attributionControl.addAttribution).toHaveBeenCalledOnce();

    const fitCount = leafletMocks.mapInstance.fitBounds.mock.calls.length;
    rerender(
      <BusMap
        state={{
          ...initialState,
          generatedAt: new Date().toISOString(),
          position: initialState.position
            ? {
                ...initialState.position,
                latitude: initialState.position.latitude + 0.0005,
              }
            : null,
        }}
      />,
    );

    expect(leafletMocks.geoJSON).toHaveBeenCalledOnce();
    expect(leafletMocks.mapInstance.fitBounds).toHaveBeenCalledTimes(fitCount);
    expect(leafletMocks.mapInstance.panTo).not.toHaveBeenCalled();
  });

  it("omits an invalid route layer without touching the map", () => {
    expect(
      addRouteGeometryLayer(leafletMocks.mapInstance as never, null),
    ).toBeNull();
    expect(leafletMocks.geoJSON).not.toHaveBeenCalled();
    expect(leafletMocks.attributionControl.addAttribution).not.toHaveBeenCalled();
  });
});

describe("BusMap vehicle markers", () => {
  it("creates and reconciles one marker per route vehicle", () => {
    const initialState = createMockBusState("outbound");
    const { rerender } = render(<BusMap state={initialState} />);

    // Two fixed stop markers, followed by each route vehicle.
    expect(leafletMocks.marker).toHaveBeenCalledTimes(
      2 + initialState.routeVehicles.length,
    );
    expect(leafletMocks.marker.mock.calls[2][1]).toMatchObject({
      zIndexOffset: 1000,
    });
    expect(leafletMocks.marker.mock.calls[3][1]).toMatchObject({
      zIndexOffset: 500,
    });
    expect(leafletMocks.marker.mock.calls[2][1]).not.toHaveProperty("title");
    expect(leafletMocks.marker.mock.calls[3][1]).not.toHaveProperty("title");

    const selectedMarker = leafletMocks.markerInstances[2];
    const removedMarker = leafletMocks.markerInstances[4];
    const fitCount = leafletMocks.mapInstance.fitBounds.mock.calls.length;
    const remainingVehicles = initialState.routeVehicles.slice(0, 2).map(
      (vehicle, index) => ({
        ...vehicle,
        position: {
          ...vehicle.position,
          latitude: vehicle.position.latitude + (index + 1) * 0.0001,
        },
      }),
    );

    rerender(
      <BusMap
        state={{
          ...initialState,
          routeVehicles: remainingVehicles,
        }}
      />,
    );

    expect(leafletMocks.marker).toHaveBeenCalledTimes(
      2 + initialState.routeVehicles.length,
    );
    expect(selectedMarker.setLatLng).toHaveBeenCalled();
    expect(selectedMarker.setIcon).toHaveBeenCalled();
    expect(selectedMarker.setZIndexOffset).toHaveBeenCalledWith(1000);
    expect(removedMarker.remove).toHaveBeenCalledOnce();
    expect(leafletMocks.mapInstance.fitBounds).toHaveBeenCalledTimes(fitCount);
  });

  it("renders safe livery gradients, selected emphasis and stale ages", () => {
    const state = createMockBusState("outbound");
    const selected = state.routeVehicles[0];
    const recordedAt = Date.parse(selected.tracking.recordedAt);

    vehicleIcon(selected, true, recordedAt + 18_000);
    const selectedOptions = leafletMocks.divIcon.mock.calls.at(-1)?.[0] as {
      html: string;
      iconSize: number[];
    };
    expect(selectedOptions.iconSize).toEqual([42, 54]);
    expect(selectedOptions.html).toContain(
      "bus-map__vehicle-marker--selected",
    );
    expect(selectedOptions.html).toContain('stop-color="#ee1d23"');
    expect(selectedOptions.html).not.toContain("bus-map__vehicle-age");

    vehicleIcon(
      { ...selected, status: "stale" },
      false,
      recordedAt + 180_000,
    );
    const staleOptions = leafletMocks.divIcon.mock.calls.at(-1)?.[0] as {
      html: string;
      iconSize: number[];
    };
    expect(staleOptions.iconSize).toEqual([28, 36]);
    expect(staleOptions.html).toContain("bus-map__vehicle-marker--stale");
    expect(staleOptions.html).toContain(
      '<text class="bus-map__vehicle-age" x="21" y="35" text-anchor="middle">3m</text>',
    );
  });

  it("falls back to route direction when a bearing is unavailable", () => {
    const state = createMockBusState("outbound");
    const vehicle: RouteBusVehicle = {
      ...state.routeVehicles[0],
      direction: "inbound",
      position: { ...state.routeVehicles[0].position, bearing: null },
    };

    vehicleIcon(vehicle, false, Date.parse(vehicle.tracking.recordedAt));
    const options = leafletMocks.divIcon.mock.calls.at(-1)?.[0] as {
      html: string;
    };
    expect(options.html).toContain('transform="rotate(270 21 27)"');
  });

  it("uses a monochrome marker when livery metadata is missing", () => {
    const state = createMockBusState("outbound");
    const vehicle = { ...state.routeVehicles[1], livery: null };

    vehicleIcon(vehicle, false, Date.parse(vehicle.tracking.recordedAt));
    const options = leafletMocks.divIcon.mock.calls.at(-1)?.[0] as {
      html: string;
    };

    expect(options.html).toContain('stop-color="#f7f7f4"');
  });

  it("formats stale ages compactly across minutes, hours and days", () => {
    expect(formatBusMarkerAge(179)).toBeNull();
    expect(formatBusMarkerAge(180)).toBe("3m");
    expect(formatBusMarkerAge(3_599)).toBe("59m");
    expect(formatBusMarkerAge(3_600)).toBe("1h");
    expect(formatBusMarkerAge(7_200)).toBe("2h");
    expect(formatBusMarkerAge(86_400)).toBe("1d");
    expect(formatBusMarkerAge(172_800)).toBe("2d");
  });
});
