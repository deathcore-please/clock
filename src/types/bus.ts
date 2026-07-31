export type BusStatus = "ready" | "stale" | "not_tracking" | "unavailable";

export type BusPhase =
  | "at_station"
  | "toward_trinity"
  | "approaching_station"
  | "not_tracking";

export type BusDirection = "outbound" | "inbound" | null;

export type PunctualityStatus = "early" | "on_time" | "late" | "unknown";

export interface BusPosition {
  latitude: number;
  longitude: number;
  bearing: number;
}

export interface BusTarget {
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceMetres: number | null;
}

export interface BusState {
  version: 1;
  generatedAt: string;
  status: BusStatus;
  service: {
    line: "37";
    operator: "Carousel Buses";
    operatorRef: "CSLB";
    direction: BusDirection;
    destination: string | null;
  };
  phase: BusPhase;
  vehicle: {
    id: string | null;
  };
  position: BusPosition | null;
  target: BusTarget | null;
  tracking: {
    recordedAt: string | null;
    ageSeconds: number | null;
  };
  punctuality: {
    status: PunctualityStatus;
    deviationMinutes: number | null;
  };
}

export type BusMockScenario =
  | "station"
  | "outbound"
  | "inbound"
  | "stale"
  | "untracked";
