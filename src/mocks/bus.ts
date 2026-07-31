import {
  HIGH_WYCOMBE_STOP,
  TRINITY_STOP,
  notTrackingBusState,
} from "../lib/bus";
import type { BusMockScenario, BusPhase, BusState } from "../types/bus";

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

  return {
    version: 1,
    generatedAt: now.toISOString(),
    status: scenario === "stale" ? "stale" : "ready",
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
      recordedAt: new Date(now.getTime() - mock.secondsOld * 1_000).toISOString(),
      ageSeconds: mock.secondsOld,
    },
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
