import { describe, expect, it } from "vitest";
import {
  HIGH_WYCOMBE_STOP,
  TRINITY_STOP,
  distanceMetres,
  normaliseBusActivities,
  normaliseSiriVm,
  parseSiriVm,
  type BusActivity,
} from "./bus";

const now = new Date("2026-08-03T07:10:00Z");

function activity(overrides: Partial<BusActivity> = {}): BusActivity {
  return {
    recordedAt: new Date(now.getTime() - 10_000).toISOString(),
    lineRef: "37",
    publishedLineName: "37",
    operatorRef: "CSLB",
    directionRef: "outbound",
    originRef: HIGH_WYCOMBE_STOP.stopId,
    destinationRef: "035000000001",
    destinationName: "Windsor Town Centre",
    vehicleRef: "CSLB-1",
    latitude: HIGH_WYCOMBE_STOP.latitude,
    longitude: HIGH_WYCOMBE_STOP.longitude,
    bearing: 112,
    aimedTime: null,
    expectedTime: null,
    ...overrides,
  };
}

function siriXml() {
  return `<?xml version="1.0"?>
    <siri:Siri xmlns:siri="http://www.siri.org.uk/siri">
      <siri:ServiceDelivery>
        <siri:VehicleMonitoringDelivery>
          <siri:VehicleActivity>
            <siri:RecordedAtTime>2026-08-03T08:09:45+01:00</siri:RecordedAtTime>
            <siri:MonitoredVehicleJourney>
              <siri:LineRef>37</siri:LineRef>
              <siri:PublishedLineName>37</siri:PublishedLineName>
              <siri:OperatorRef>CSLB</siri:OperatorRef>
              <siri:DirectionRef>outbound</siri:DirectionRef>
              <siri:OriginRef>${HIGH_WYCOMBE_STOP.stopId}</siri:OriginRef>
              <siri:DestinationRef>035000000001</siri:DestinationRef>
              <siri:DestinationName>Windsor Town Centre</siri:DestinationName>
              <siri:VehicleRef>CSLB-80456</siri:VehicleRef>
              <siri:VehicleLocation>
                <siri:Longitude>${HIGH_WYCOMBE_STOP.longitude}</siri:Longitude>
                <siri:Latitude>${HIGH_WYCOMBE_STOP.latitude}</siri:Latitude>
              </siri:VehicleLocation>
              <siri:Bearing>112</siri:Bearing>
              <siri:MonitoredCall>
                <siri:AimedDepartureTime>2026-08-03T08:08:00+01:00</siri:AimedDepartureTime>
                <siri:ExpectedDepartureTime>2026-08-03T08:10:00+01:00</siri:ExpectedDepartureTime>
              </siri:MonitoredCall>
            </siri:MonitoredVehicleJourney>
          </siri:VehicleActivity>
        </siri:VehicleMonitoringDelivery>
      </siri:ServiceDelivery>
    </siri:Siri>`;
}

describe("BODS bus normalisation", () => {
  it("parses namespaced SIRI-VM vehicle activity", () => {
    const parsed = parseSiriVm(siriXml());
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      publishedLineName: "37",
      operatorRef: "CSLB",
      vehicleRef: "CSLB-80456",
      aimedTime: "2026-08-03T08:08:00+01:00",
      expectedTime: "2026-08-03T08:10:00+01:00",
    });
  });

  it("prioritises an outbound bus at High Wycombe over other candidates", () => {
    const state = normaliseBusActivities(
      [
        activity({
          vehicleRef: "outbound-moving",
          latitude: 51.62925,
          longitude: -0.7494,
        }),
        activity({
          vehicleRef: "inbound",
          directionRef: "inbound",
          originRef: "035000000001",
          destinationRef: HIGH_WYCOMBE_STOP.stopId,
          destinationName: "High Wycombe",
          latitude: 51.6373,
          longitude: -0.7105,
        }),
        activity({ vehicleRef: "station" }),
      ],
      now,
    );
    expect(state.phase).toBe("at_station");
    expect(state.vehicle.id).toBe("station");
    expect(state.target?.stopId).toBe(TRINITY_STOP.stopId);
  });

  it("selects the outbound bus closest to Trinity when none is waiting", () => {
    const state = normaliseBusActivities(
      [
        activity({ vehicleRef: "far", latitude: 51.6302, longitude: -0.752 }),
        activity({ vehicleRef: "near", latitude: 51.6275, longitude: -0.744 }),
      ],
      now,
    );
    expect(state.phase).toBe("toward_trinity");
    expect(state.vehicle.id).toBe("near");
  });

  it("falls back to the nearest inbound Route 37 and excludes variants", () => {
    const state = normaliseBusActivities(
      [
        activity({ publishedLineName: "37M", vehicleRef: "wrong-variant" }),
        activity({
          vehicleRef: "far-inbound",
          directionRef: "inbound",
          originRef: "035000000001",
          destinationRef: HIGH_WYCOMBE_STOP.stopId,
          destinationName: "High Wycombe",
          latitude: 51.66,
          longitude: -0.68,
        }),
        activity({
          vehicleRef: "near-inbound",
          directionRef: "inbound",
          originRef: "035000000001",
          destinationRef: HIGH_WYCOMBE_STOP.stopId,
          destinationName: "High Wycombe",
          latitude: 51.6373,
          longitude: -0.7105,
        }),
      ],
      now,
    );
    expect(state.phase).toBe("approaching_station");
    expect(state.vehicle.id).toBe("near-inbound");
    expect(state.target?.stopId).toBe(HIGH_WYCOMBE_STOP.stopId);
  });

  it("marks old positions stale and computes early, on-time, and late states", () => {
    const stale = normaliseBusActivities(
      [activity({ recordedAt: new Date(now.getTime() - 91_000).toISOString() })],
      now,
    );
    expect(stale.status).toBe("stale");

    const late = normaliseSiriVm(siriXml(), now);
    expect(late.punctuality).toEqual({ status: "late", deviationMinutes: 2 });

    const onTime = normaliseBusActivities(
      [
        activity({
          aimedTime: "2026-08-03T08:08:00+01:00",
          expectedTime: "2026-08-03T08:09:00+01:00",
        }),
      ],
      now,
    );
    expect(onTime.punctuality.status).toBe("on_time");

    const early = normaliseBusActivities(
      [
        activity({
          aimedTime: "2026-08-03T08:08:00+01:00",
          expectedTime: "2026-08-03T08:06:00+01:00",
        }),
      ],
      now,
    );
    expect(early.punctuality).toEqual({ status: "early", deviationMinutes: -2 });
  });

  it("returns not tracking for malformed or non-matching activities", () => {
    expect(normaliseSiriVm("<Siri />", now).status).toBe("not_tracking");
    expect(
      normaliseBusActivities([activity({ publishedLineName: "37M" })], now).status,
    ).toBe("not_tracking");
  });

  it("calculates a plausible Haversine distance between the two stops", () => {
    const distance = distanceMetres(HIGH_WYCOMBE_STOP, TRINITY_STOP);
    expect(distance).toBeGreaterThan(900);
    expect(distance).toBeLessThan(1_200);
  });
});
