import { XMLParser } from "fast-xml-parser";
import type {
  BusDirection,
  BusPhase,
  BusState,
  PunctualityStatus,
} from "../types/bus";

export const HIGH_WYCOMBE_STOP = {
  stopId: "040000002961",
  name: "High Wycombe Bus Station",
  latitude: 51.63134,
  longitude: -0.75635,
} as const;

export const TRINITY_STOP = {
  stopId: "040000003243",
  name: "Trinity Church",
  latitude: 51.6268962,
  longitude: -0.7429268,
} as const;

const STATION_GEOFENCE_METRES = 250;
const LOCAL_CORRIDOR_METRES = 450;
const STALE_AFTER_SECONDS = 90;

export interface BusActivity {
  recordedAt: string;
  lineRef: string;
  publishedLineName: string;
  operatorRef: string;
  directionRef: string;
  originRef: string;
  destinationRef: string;
  destinationName: string;
  vehicleRef: string;
  latitude: number;
  longitude: number;
  bearing: number;
  aimedTime: string | null;
  expectedTime: string | null;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (!value || typeof value !== "object") return "";
  const nested = record(value);
  const nestedValue = nested["#text"] ?? nested._;
  return nestedValue === undefined ? "" : text(nestedValue);
}

function findValues(value: unknown, key: string, results: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const item of value) findValues(item, key, results);
    return results;
  }
  if (!value || typeof value !== "object") return results;

  for (const [entryKey, entryValue] of Object.entries(value as UnknownRecord)) {
    if (entryKey === key) {
      if (Array.isArray(entryValue)) results.push(...entryValue);
      else results.push(entryValue);
    } else {
      findValues(entryValue, key, results);
    }
  }
  return results;
}

function firstTimePair(journey: UnknownRecord) {
  const calls = [
    record(journey.MonitoredCall),
    record(journey.OnwardCall),
    record(journey.OriginCall),
  ];
  for (const call of calls) {
    const aimed = text(call.AimedArrivalTime || call.AimedDepartureTime);
    const expected = text(call.ExpectedArrivalTime || call.ExpectedDepartureTime);
    if (aimed && expected) return { aimed, expected };
  }
  return {
    aimed: text(journey.DestinationAimedArrivalTime) || null,
    expected: text(journey.DestinationExpectedArrivalTime) || null,
  };
}

export function parseSiriVm(xml: string): BusActivity[] {
  const parsed = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    trimValues: true,
  }).parse(xml) as unknown;

  return findValues(parsed, "VehicleActivity").flatMap((value) => {
    const activity = record(value);
    const journey = record(activity.MonitoredVehicleJourney);
    const location = record(journey.VehicleLocation);
    const latitude = Number(text(location.Latitude));
    const longitude = Number(text(location.Longitude));
    const recordedAt = text(activity.RecordedAtTime);
    if (!recordedAt || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return [];
    }

    const times = firstTimePair(journey);
    return [
      {
        recordedAt,
        lineRef: text(journey.LineRef),
        publishedLineName: text(journey.PublishedLineName),
        operatorRef: text(journey.OperatorRef),
        directionRef: text(journey.DirectionRef),
        originRef: text(journey.OriginRef),
        destinationRef: text(journey.DestinationRef),
        destinationName: text(journey.DestinationName),
        vehicleRef: text(journey.VehicleRef),
        latitude,
        longitude,
        bearing: Number(text(journey.Bearing)) || 0,
        aimedTime: times.aimed,
        expectedTime: times.expected,
      },
    ];
  });
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceMetres(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const earthRadius = 6_371_000;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

function localProjection(point: { latitude: number; longitude: number }) {
  const originLatitude = radians(HIGH_WYCOMBE_STOP.latitude);
  return {
    x:
      radians(point.longitude - HIGH_WYCOMBE_STOP.longitude) *
      Math.cos(originLatitude) *
      6_371_000,
    y: radians(point.latitude - HIGH_WYCOMBE_STOP.latitude) * 6_371_000,
  };
}

function isInOutboundCorridor(activity: BusActivity) {
  const point = localProjection(activity);
  const end = localProjection(TRINITY_STOP);
  const lengthSquared = end.x ** 2 + end.y ** 2;
  const progress = (point.x * end.x + point.y * end.y) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, progress));
  const perpendicular = Math.hypot(
    point.x - clamped * end.x,
    point.y - clamped * end.y,
  );
  return progress >= -0.1 && progress <= 1.15 && perpendicular <= LOCAL_CORRIDOR_METRES;
}

function routeDirection(activity: BusActivity): BusDirection {
  const direction = activity.directionRef.toLowerCase();
  const destination = activity.destinationName.toLowerCase();
  if (
    activity.destinationRef === HIGH_WYCOMBE_STOP.stopId ||
    destination.includes("high wycombe") ||
    direction.includes("inbound")
  ) {
    return "inbound";
  }
  if (
    activity.originRef === HIGH_WYCOMBE_STOP.stopId ||
    direction.includes("outbound") ||
    destination.includes("windsor") ||
    destination.includes("bourne end") ||
    destination.includes("maidenhead")
  ) {
    return "outbound";
  }
  return null;
}

function punctuality(activity: BusActivity): {
  status: PunctualityStatus;
  deviationMinutes: number | null;
} {
  if (!activity.aimedTime || !activity.expectedTime) {
    return { status: "unknown", deviationMinutes: null };
  }
  const aimed = Date.parse(activity.aimedTime);
  const expected = Date.parse(activity.expectedTime);
  if (!Number.isFinite(aimed) || !Number.isFinite(expected)) {
    return { status: "unknown", deviationMinutes: null };
  }
  const differenceSeconds = (expected - aimed) / 1_000;
  if (Math.abs(differenceSeconds) <= 60) {
    return { status: "on_time", deviationMinutes: 0 };
  }
  const minutes = Math.max(1, Math.round(Math.abs(differenceSeconds) / 60));
  return {
    status: differenceSeconds > 0 ? "late" : "early",
    deviationMinutes: differenceSeconds > 0 ? minutes : -minutes,
  };
}

function emptyBusState(now: Date, status: "not_tracking" | "unavailable"): BusState {
  return {
    version: 1,
    generatedAt: now.toISOString(),
    status,
    service: {
      line: "37",
      operator: "Carousel Buses",
      operatorRef: "CSLB",
      direction: null,
      destination: null,
    },
    phase: "not_tracking",
    vehicle: { id: null },
    position: null,
    target: null,
    tracking: { recordedAt: null, ageSeconds: null },
    punctuality: { status: "unknown", deviationMinutes: null },
  };
}

export function unavailableBusState(now = new Date()): BusState {
  return emptyBusState(now, "unavailable");
}

export function notTrackingBusState(now = new Date()): BusState {
  return emptyBusState(now, "not_tracking");
}

function selectCandidate(activities: BusActivity[]) {
  const exactRoute = activities.filter(
    (activity) =>
      (activity.publishedLineName || activity.lineRef).trim().toUpperCase() === "37" &&
      activity.operatorRef.trim().toUpperCase() === "CSLB",
  );

  const atStation = exactRoute
    .filter(
      (activity) =>
        routeDirection(activity) === "outbound" &&
        distanceMetres(activity, HIGH_WYCOMBE_STOP) <= STATION_GEOFENCE_METRES,
    )
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
  if (atStation[0]) return { activity: atStation[0], phase: "at_station" as const };

  const outbound = exactRoute
    .filter(
      (activity) =>
        routeDirection(activity) === "outbound" && isInOutboundCorridor(activity),
    )
    .sort(
      (a, b) =>
        distanceMetres(a, TRINITY_STOP) - distanceMetres(b, TRINITY_STOP),
    );
  if (outbound[0]) return { activity: outbound[0], phase: "toward_trinity" as const };

  const inbound = exactRoute
    .filter((activity) => routeDirection(activity) === "inbound")
    .sort(
      (a, b) =>
        distanceMetres(a, HIGH_WYCOMBE_STOP) - distanceMetres(b, HIGH_WYCOMBE_STOP),
    );
  if (inbound[0]) return { activity: inbound[0], phase: "approaching_station" as const };

  return null;
}

export function normaliseBusActivities(
  activities: BusActivity[],
  now = new Date(),
): BusState {
  const selected = selectCandidate(activities);
  if (!selected) return notTrackingBusState(now);

  const { activity, phase } = selected;
  const target = phase === "approaching_station" ? HIGH_WYCOMBE_STOP : TRINITY_STOP;
  const recordedAt = Date.parse(activity.recordedAt);
  const ageSeconds = Number.isFinite(recordedAt)
    ? Math.max(0, Math.floor((now.getTime() - recordedAt) / 1_000))
    : null;
  const status = ageSeconds !== null && ageSeconds > STALE_AFTER_SECONDS ? "stale" : "ready";
  const direction = routeDirection(activity);

  return {
    version: 1,
    generatedAt: now.toISOString(),
    status,
    service: {
      line: "37",
      operator: "Carousel Buses",
      operatorRef: "CSLB",
      direction,
      destination:
        activity.destinationName ||
        (direction === "inbound" ? "High Wycombe" : "Windsor / Bourne End"),
    },
    phase: phase as BusPhase,
    vehicle: { id: activity.vehicleRef || null },
    position: {
      latitude: activity.latitude,
      longitude: activity.longitude,
      bearing: activity.bearing,
    },
    target: {
      ...target,
      distanceMetres: Math.round(distanceMetres(activity, target)),
    },
    tracking: {
      recordedAt: activity.recordedAt,
      ageSeconds,
    },
    punctuality: punctuality(activity),
  };
}

export function normaliseSiriVm(xml: string, now = new Date()): BusState {
  return normaliseBusActivities(parseSiriVm(xml), now);
}
