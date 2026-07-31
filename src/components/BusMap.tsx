import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import route37Snapshot from "../data/route-37.json";
import { HIGH_WYCOMBE_STOP, TRINITY_STOP } from "../lib/bus";
import {
  normaliseRouteGeometry,
  type RouteGeometryFeature,
} from "../lib/route-geometry";
import type { BusState } from "../types/bus";

export const ROUTE_37_STYLE: L.PathOptions = {
  color: "#f7f7f4",
  weight: 3,
  opacity: 0.75,
  lineCap: "round",
  lineJoin: "round",
  interactive: false,
};

const ROUTE_37_ATTRIBUTION =
  'Route data: <a href="https://bustimes.org/services/37-high-wycombe-maidenhead">bustimes.org</a>';
const route37Geometry = normaliseRouteGeometry(route37Snapshot);

export function addRouteGeometryLayer(
  map: L.Map,
  geometry: RouteGeometryFeature | null,
) {
  if (!geometry) return null;
  const layer = L.geoJSON(geometry, {
    interactive: false,
    style: ROUTE_37_STYLE,
  }).addTo(map);
  map.attributionControl.addAttribution(ROUTE_37_ATTRIBUTION);
  return layer;
}

function stopIcon(label: string) {
  return L.divIcon({
    className: "bus-map__stop-icon",
    html: `<span>${label}</span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function vehicleIcon(bearing: number) {
  return L.divIcon({
    className: "bus-map__vehicle-icon",
    html: `<span style="transform: rotate(${Number.isFinite(bearing) ? bearing : 0}deg)">▲</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export function BusMap({ state }: { state: BusState | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const vehicleMarkerRef = useRef<L.Marker | null>(null);
  const lastFitKeyRef = useRef("");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      attributionControl: true,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      zoomSnap: 0.1,
      fadeAnimation: false,
      markerZoomAnimation: false,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      detectRetina: false,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    addRouteGeometryLayer(map, route37Geometry);
    L.marker([HIGH_WYCOMBE_STOP.latitude, HIGH_WYCOMBE_STOP.longitude], {
      icon: stopIcon("H"),
      keyboard: false,
      title: HIGH_WYCOMBE_STOP.name,
    }).addTo(map);
    L.marker([TRINITY_STOP.latitude, TRINITY_STOP.longitude], {
      icon: stopIcon("T"),
      keyboard: false,
      title: TRINITY_STOP.name,
    }).addTo(map);
    map.fitBounds(
      [
        [HIGH_WYCOMBE_STOP.latitude, HIGH_WYCOMBE_STOP.longitude],
        [TRINITY_STOP.latitude, TRINITY_STOP.longitude],
      ],
      { padding: [40, 40], animate: false },
    );
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(false), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      vehicleMarkerRef.current = null;
      lastFitKeyRef.current = "";
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const position = state?.position;
    if (!position) {
      if (vehicleMarkerRef.current) {
        vehicleMarkerRef.current.remove();
        vehicleMarkerRef.current = null;
      }
      return;
    }

    const coordinates = L.latLng(position.latitude, position.longitude);
    if (!vehicleMarkerRef.current) {
      vehicleMarkerRef.current = L.marker(coordinates, {
        icon: vehicleIcon(position.bearing),
        keyboard: false,
        title: "Live Route 37 position",
        zIndexOffset: 1000,
      }).addTo(map);
    } else {
      vehicleMarkerRef.current
        .setLatLng(coordinates)
        .setIcon(vehicleIcon(position.bearing));
    }

    const fitKey = `${state.phase}:${state.vehicle.id ?? "unknown"}`;
    if (lastFitKeyRef.current !== fitKey) {
      const points: L.LatLngExpression[] = [coordinates];
      if (state.phase === "approaching_station") {
        points.push([HIGH_WYCOMBE_STOP.latitude, HIGH_WYCOMBE_STOP.longitude]);
      } else {
        points.push(
          [HIGH_WYCOMBE_STOP.latitude, HIGH_WYCOMBE_STOP.longitude],
          [TRINITY_STOP.latitude, TRINITY_STOP.longitude],
        );
      }
      map.fitBounds(L.latLngBounds(points), { padding: [44, 44], animate: false });
      if (state.phase !== "approaching_station") {
        map.setZoom(map.getZoom() + 0.2, { animate: false });
      }
      lastFitKeyRef.current = fitKey;
    }
  }, [state]);

  return (
    <div
      ref={containerRef}
      className="bus-map"
      role="img"
      aria-label="Map showing Route 37 between High Wycombe Bus Station and Trinity Church"
    />
  );
}
