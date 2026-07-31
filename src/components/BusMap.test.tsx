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
    divIcon: vi.fn(() => ({})),
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
    marker: vi.fn(() => {
      const marker = {
        addTo: vi.fn(),
        remove: vi.fn(),
        setIcon: vi.fn(),
        setLatLng: vi.fn(),
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

import { addRouteGeometryLayer, BusMap } from "./BusMap";
import { createMockBusState } from "../mocks/bus";

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
