import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import route37Snapshot from "../data/route-37.json";
import { HIGH_WYCOMBE_STOP, TRINITY_STOP } from "../lib/bus";
import {
  normaliseRouteGeometry,
  type RouteGeometryFeature,
} from "../lib/route-geometry";
import type { BusDirection, BusState, RouteBusVehicle } from "../types/bus";

export const ROUTE_37_STYLE: L.PathOptions = {
  color: "#f7f7f4",
  weight: 3,
  opacity: 0.75,
  lineCap: "round",
  lineJoin: "round",
  interactive: false,
};

const ROUTE_37_ATTRIBUTION =
  'Route, vehicle &amp; livery data: <a href="https://bustimes.org/services/37-high-wycombe-maidenhead">bustimes.org</a>';
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

function fallbackBearing(direction: BusDirection) {
  return direction === "inbound" ? 270 : 90;
}

function resolvedBearing(vehicle: RouteBusVehicle) {
  return typeof vehicle.position.bearing === "number" &&
    Number.isFinite(vehicle.position.bearing)
    ? vehicle.position.bearing
    : fallbackBearing(vehicle.direction);
}

function markerAgeSeconds(vehicle: RouteBusVehicle, nowMs: number) {
  const recordedAt = Date.parse(vehicle.tracking.recordedAt);
  if (Number.isFinite(recordedAt)) {
    return Math.max(0, Math.floor((nowMs - recordedAt) / 1_000));
  }
  return Math.max(0, Math.floor(vehicle.tracking.ageSeconds));
}

export function formatBusMarkerAge(ageSeconds: number) {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 180) return null;
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function safeGradientId(vehicleId: string) {
  const safeId = vehicleId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `bus-livery-${safeId || "unknown"}`;
}

function safeColour(colour: string) {
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour : null;
}

function liveryStops(vehicle: RouteBusVehicle) {
  const colours = vehicle.livery?.colours
    .map(safeColour)
    .filter((colour): colour is string => colour !== null);
  const validColours = colours && colours.length > 0 ? colours : ["#f7f7f4"];
  const divisor = Math.max(1, validColours.length - 1);
  return validColours
    .map(
      (colour, index) =>
        `<stop offset="${(index / divisor) * 100}%" stop-color="${colour}" />`,
    )
    .join("");
}

function safeGradientAngle(vehicle: RouteBusVehicle) {
  const angle = vehicle.livery?.angleDegrees;
  if (typeof angle !== "number" || !Number.isFinite(angle)) return 90;
  return ((angle % 360) + 360) % 360;
}

export function vehicleIcon(
  vehicle: RouteBusVehicle,
  selected: boolean,
  nowMs: number,
) {
  const ageSeconds = markerAgeSeconds(vehicle, nowMs);
  const stale = vehicle.status === "stale" || ageSeconds >= 180;
  const ageLabel = stale
    ? formatBusMarkerAge(Math.max(180, ageSeconds))
    : null;
  const markerWidth = selected ? 42 : 28;
  const markerHeight = selected ? 54 : 36;
  const gradientId = safeGradientId(vehicle.id);
  const classes = [
    "bus-map__vehicle-marker",
    selected ? "bus-map__vehicle-marker--selected" : "",
    stale ? "bus-map__vehicle-marker--stale" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return L.divIcon({
    className: "bus-map__vehicle-icon",
    html: `<div class="${classes}">
      <svg viewBox="0 0 42 54" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="0" gradientTransform="rotate(${safeGradientAngle(vehicle)} 0.5 0.5)">
            ${liveryStops(vehicle)}
          </linearGradient>
        </defs>
        <g class="bus-map__vehicle-rotator" transform="rotate(${resolvedBearing(vehicle)} 21 27)">
          <path class="bus-map__vehicle-arrow" d="M21 1 28 10h-4v5h-6v-5h-4Z" />
          <rect class="bus-map__vehicle-halo" x="7" y="13" width="28" height="38" rx="5" />
          <rect class="bus-map__vehicle-livery" x="8" y="14" width="26" height="36" rx="4" fill="url(#${gradientId})" />
          <path class="bus-map__vehicle-window" d="M12 18h18v7H12z" />
          <path class="bus-map__vehicle-window" d="M12 39h18v6H12z" />
          <path class="bus-map__vehicle-wheel" d="M6 21h3v8H6zm27 0h3v8h-3zM6 36h3v8H6zm27 0h3v8h-3z" />
        </g>
        ${ageLabel ? `<text class="bus-map__vehicle-age" x="21" y="35" text-anchor="middle">${ageLabel}</text>` : ""}
      </svg>
    </div>`,
    iconSize: [markerWidth, markerHeight],
    iconAnchor: [markerWidth / 2, markerHeight / 2],
  });
}

export function BusMap({ state }: { state: BusState | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const vehicleMarkersRef = useRef(new Map<string, L.Marker>());
  const lastFitKeyRef = useRef("");
  const [markerNow, setMarkerNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setMarkerNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

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
      vehicleMarkersRef.current.clear();
      lastFitKeyRef.current = "";
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const selectedId = state?.vehicle.id ?? null;
    const visibleIds = new Set<string>();

    for (const vehicle of state?.routeVehicles ?? []) {
      visibleIds.add(vehicle.id);
      const coordinates = L.latLng(
        vehicle.position.latitude,
        vehicle.position.longitude,
      );
      const selected = vehicle.id === selectedId;
      const icon = vehicleIcon(vehicle, selected, markerNow);
      const marker = vehicleMarkersRef.current.get(vehicle.id);

      if (!marker) {
        const nextMarker = L.marker(coordinates, {
          icon,
          keyboard: false,
          zIndexOffset: selected ? 1000 : 500,
        }).addTo(map);
        vehicleMarkersRef.current.set(vehicle.id, nextMarker);
      } else {
        marker.setLatLng(coordinates);
        marker.setIcon(icon);
        marker.setZIndexOffset(selected ? 1000 : 500);
      }
    }

    for (const [vehicleId, marker] of vehicleMarkersRef.current) {
      if (!visibleIds.has(vehicleId)) {
        marker.remove();
        vehicleMarkersRef.current.delete(vehicleId);
      }
    }

    const position = state?.position;
    if (!position) return;

    const selectedCoordinates = L.latLng(position.latitude, position.longitude);
    const fitKey = `${state.phase}:${selectedId ?? "unknown"}`;
    if (lastFitKeyRef.current !== fitKey) {
      const points: L.LatLngExpression[] = [selectedCoordinates];
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
  }, [markerNow, state]);

  return (
    <div
      ref={containerRef}
      className="bus-map"
      role="img"
      aria-label="Map showing Route 37 between High Wycombe Bus Station and Trinity Church"
    />
  );
}
