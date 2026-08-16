import {
  HIGH_WYCOMBE_STOP,
  TRINITY_STOP,
  notTrackingBusState,
} from "../lib/bus";
import type {
  BusLivery,
  BusMockScenario,
  BusPhase,
  BusState,
  RouteBusVehicle,
} from "../types/bus";

const CAROUSEL_COUNTRY_LIVERY: BusLivery = {
  id: 3384,
  name: "Carousel Country",
  colours: ["#ee1d23", "#94111e"],
  angleDegrees: 60,
};

const CAROUSEL_LIVERY: BusLivery = {
  id: 118,
  name: "Carousel Buses",
  colours: ["#ed1c24", "#f6cc20"],
  angleDegrees: 90,
};

function liveState(
  scenario: Exclude<BusMockScenario, "untracked">,
  now: Date,
): BusState {
  const configurations: Record<
    Exclude<BusMockScenario, "untracked">,
    {
      phase: BusPhase;
      latitude: number;
      longitude: number;
      bearing: number;
      secondsOld: number;
      destination: string;
      distanceMetres: number;
      deviationMinutes: number;
    }
  > = {
    station: {
      phase: "at_station",
      latitude: HIGH_WYCOMBE_STOP.latitude,
      longitude: HIGH_WYCOMBE_STOP.longitude,
      bearing: 112,
      secondsOld: 12,
      destination: "Windsor Town Centre",
      distanceMetres: 1_090,
      deviationMinutes: 2,
    },
    outbound: {
      phase: "toward_trinity",
      latitude: 51.62925,
      longitude: -0.7494,
      bearing: 112,
      secondsOld: 18,
      destination: "Windsor Town Centre",
      distanceMetres: 515,
      deviationMinutes: 0,
    },
    inbound: {
      phase: "approaching_station",
      latitude: 51.6373,
      longitude: -0.7105,
      bearing: 268,
      secondsOld: 24,
      destination: "High Wycombe",
      distanceMetres: 3_260,
      deviationMinutes: -1,
    },
    stale: {
      phase: "toward_trinity",
      latitude: 51.62925,
      longitude: -0.7494,
      bearing: 112,
      secondsOld: 185,
      destination: "Bourne End",
      distanceMetres: 515,
      deviationMinutes: 3,
    },
  };
  const mock = configurations[scenario];
  const inbound = mock.phase === "approaching_station";
  const target = inbound ? HIGH_WYCOMBE_STOP : TRINITY_STOP;
  const deviation = mock.deviationMinutes;
  const recordedAt = new Date(
    now.getTime() - mock.secondsOld * 1_000,
  ).toISOString();
  const selectedStatus = scenario === "stale" ? "stale" : "ready";
  const selectedVehicle: RouteBusVehicle = {
    id: "CSLB-80456",
    direction: inbound ? "inbound" : "outbound",
    position: {
      latitude: mock.latitude,
      longitude: mock.longitude,
      bearing: mock.bearing,
    },
    tracking: {
      recordedAt,
      ageSeconds: mock.secondsOld,
    },
    status: selectedStatus,
    livery: CAROUSEL_COUNTRY_LIVERY,
  };

  return {
    version: 2,
    generatedAt: now.toISOString(),
    status: selectedStatus,
    service: {
      line: "37",
      operator: "Carousel Buses",
      operatorRef: "CSLB",
      direction: inbound ? "inbound" : "outbound",
      destination: mock.destination,
    },
    phase: mock.phase,
    vehicle: { id: "CSLB-80456" },
    position: {
      latitude: mock.latitude,
      longitude: mock.longitude,
      bearing: mock.bearing,
    },
    target: { ...target, distanceMetres: mock.distanceMetres },
    tracking: {
      recordedAt,
      ageSeconds: mock.secondsOld,
    },
    routeVehicles: [
      selectedVehicle,
      {
        id: "CSLB-80457",
        direction: "outbound",
        position: {
          latitude: 51.6352,
          longitude: -0.7326,
          bearing: 118,
        },
        tracking: {
          recordedAt: new Date(now.getTime() - 42_000).toISOString(),
          ageSeconds: 42,
        },
        status: "ready",
        livery: CAROUSEL_LIVERY,
      },
      {
        id: "CSLB-80458",
        direction: "inbound",
        position: {
          latitude: 51.646,
          longitude: -0.695,
          bearing: null,
        },
        tracking: {
          recordedAt: new Date(now.getTime() - 245_000).toISOString(),
          ageSeconds: 245,
        },
        status: "stale",
        livery: CAROUSEL_COUNTRY_LIVERY,
      },
    ],
    punctuality: {
      status: deviation === 0 ? "on_time" : deviation > 0 ? "late" : "early",
      deviationMinutes: deviation,
    },
  };
}

export function createMockBusState(
  scenario: BusMockScenario = "station",
  now = new Date(),
): BusState {
  return scenario === "untracked" ? notTrackingBusState(now) : liveState(scenario, now);
}
