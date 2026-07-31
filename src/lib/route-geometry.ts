import { HIGH_WYCOMBE_STOP, TRINITY_STOP } from "./bus";

export type RouteCoordinate = [longitude: number, latitude: number];

export interface RouteGeometryProperties {
  serviceId: 76857;
  line: "37";
  source: string;
  sourceModifiedAt: string;
  capturedAt: string;
}

export interface RouteGeometryFeature {
  type: "Feature";
  properties: RouteGeometryProperties;
  geometry: {
    type: "MultiLineString";
    coordinates: RouteCoordinate[][];
  };
}

const UK_BOUNDS = {
  minLongitude: -9,
  maxLongitude: 2,
  minLatitude: 49,
  maxLatitude: 61,
} as const;
const REQUIRED_STOP_PROXIMITY_METRES = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isCoordinateWithinUkBounds(
  value: unknown,
): value is RouteCoordinate {
  if (!Array.isArray(value) || value.length < 2) return false;
  const [longitude, latitude] = value;
  return (
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= UK_BOUNDS.minLongitude &&
    longitude <= UK_BOUNDS.maxLongitude &&
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= UK_BOUNDS.minLatitude &&
    latitude <= UK_BOUNDS.maxLatitude
  );
}

function distanceToStop(
  [longitude, latitude]: RouteCoordinate,
  stop: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(stop.latitude - latitude);
  const longitudeDelta = radians(stop.longitude - longitude);
  const startLatitude = radians(latitude);
  const endLatitude = radians(stop.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
}

function passesRequiredStops(coordinates: RouteCoordinate[][]) {
  const points = coordinates.flat();
  return [HIGH_WYCOMBE_STOP, TRINITY_STOP].every((stop) =>
    points.some(
      (point) => distanceToStop(point, stop) <= REQUIRED_STOP_PROXIMITY_METRES,
    ),
  );
}

export function normaliseRouteGeometry(
  value: unknown,
): RouteGeometryFeature | null {
  if (!isRecord(value) || value.type !== "Feature") return null;
  const properties = value.properties;
  const geometry = value.geometry;
  if (
    !isRecord(properties) ||
    properties.serviceId !== 76857 ||
    properties.line !== "37" ||
    typeof properties.source !== "string" ||
    typeof properties.sourceModifiedAt !== "string" ||
    typeof properties.capturedAt !== "string" ||
    !isRecord(geometry) ||
    geometry.type !== "MultiLineString" ||
    !Array.isArray(geometry.coordinates)
  ) {
    return null;
  }

  const coordinates = geometry.coordinates.flatMap((line) => {
    if (
      !Array.isArray(line) ||
      line.length < 2 ||
      !line.every(isCoordinateWithinUkBounds)
    ) {
      return [];
    }
    return [line.map(([longitude, latitude]) => [longitude, latitude] as RouteCoordinate)];
  });

  if (coordinates.length === 0 || !passesRequiredStops(coordinates)) return null;

  return {
    type: "Feature",
    properties: {
      serviceId: 76857,
      line: "37",
      source: properties.source,
      sourceModifiedAt: properties.sourceModifiedAt,
      capturedAt: properties.capturedAt,
    },
    geometry: {
      type: "MultiLineString",
      coordinates,
    },
  };
}
