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
      bearing: 112,
    });
  });

  it("uses a null bearing when SIRI-VM does not report one", () => {
    const parsed = parseSiriVm(siriXml().replace("<siri:Bearing>112</siri:Bearing>", ""));
    expect(parsed[0]?.bearing).toBeNull();
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
    expect(state.routeVehicles.map((vehicle) => vehicle.id)).toEqual([
      "outbound-moving",
      "inbound",
      "station",
    ]);
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

  it("marks positions stale at three minutes and preserves them in the route list", () => {
    const fresh = normaliseBusActivities(
      [activity({ recordedAt: new Date(now.getTime() - 179_000).toISOString() })],
      now,
    );
    expect(fresh.status).toBe("ready");
    expect(fresh.routeVehicles[0]?.status).toBe("ready");

    const stale = normaliseBusActivities(
      [activity({ recordedAt: new Date(now.getTime() - 180_000).toISOString() })],
      now,
    );
    expect(stale.status).toBe("stale");
    expect(stale.routeVehicles[0]).toMatchObject({
      status: "stale",
      tracking: { ageSeconds: 180 },
    });
  });

  it("computes early, on-time, and late states", () => {

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

  it("deduplicates vehicles by their newest activity and filters the exact service", () => {
    const older = activity({
      vehicleRef: " cslb-80456 ",
      recordedAt: new Date(now.getTime() - 60_000).toISOString(),
    });
    const newest = activity({
      vehicleRef: "CSLB-80456",
      recordedAt: new Date(now.getTime() - 5_000).toISOString(),
      latitude: 51.6275,
      longitude: -0.744,
      bearing: null,
    });
    const state = normaliseBusActivities(
      [
        older,
        activity({ vehicleRef: "wrong-line", publishedLineName: "37M" }),
        activity({ vehicleRef: "wrong-operator", operatorRef: "OTHER" }),
        newest,
      ],
      now,
    );

    expect(state.routeVehicles).toHaveLength(1);
    expect(state.routeVehicles[0]).toMatchObject({
      id: "CSLB-80456",
      position: {
        latitude: newest.latitude,
        longitude: newest.longitude,
        bearing: null,
      },
      tracking: { recordedAt: newest.recordedAt, ageSeconds: 5 },
      status: "ready",
      livery: null,
    });
    expect(state.position).toEqual(state.routeVehicles[0]?.position);
  });

  it("returns all route vehicles even when none matches the selection corridor", () => {
    const state = normaliseBusActivities(
      [
        activity({
          vehicleRef: "unknown-direction",
          directionRef: "",
          originRef: "unknown-origin",
          destinationRef: "unknown-destination",
          destinationName: "Somewhere Else",
          latitude: 51.7,
          longitude: -0.6,
        }),
      ],
      now,
    );

    expect(state.status).toBe("not_tracking");
    expect(state.position).toBeNull();
    expect(state.routeVehicles).toHaveLength(1);
    expect(state.routeVehicles[0]?.direction).toBeNull();
  });

  it("returns not tracking for malformed or non-matching activities", () => {
    expect(normaliseSiriVm("<Siri />", now).status).toBe("not_tracking");
    const nonMatching = normaliseBusActivities(
      [activity({ publishedLineName: "37M" })],
      now,
    );
    expect(nonMatching.status).toBe("not_tracking");
    expect(nonMatching.routeVehicles).toEqual([]);
  });

  it("calculates a plausible Haversine distance between the two stops", () => {
    const distance = distanceMetres(HIGH_WYCOMBE_STOP, TRINITY_STOP);
    expect(distance).toBeGreaterThan(900);
    expect(distance).toBeLessThan(1_200);
  });
});
