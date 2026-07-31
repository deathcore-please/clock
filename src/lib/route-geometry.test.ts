import { describe, expect, it } from "vitest";
import route37Snapshot from "../data/route-37.json";
import {
  HIGH_WYCOMBE_STOP,
  TRINITY_STOP,
  distanceMetres,
} from "./bus";
import {
  isCoordinateWithinUkBounds,
  normaliseRouteGeometry,
  type RouteCoordinate,
} from "./route-geometry";

function distanceFromCoordinate(
  [longitude, latitude]: RouteCoordinate,
  stop: { latitude: number; longitude: number },
) {
  return distanceMetres({ latitude, longitude }, stop);
}

describe("Route 37 geometry", () => {
  it("loads a finite UK-bounded snapshot that reaches both reference stops", () => {
    const route = normaliseRouteGeometry(route37Snapshot);

    expect(route).not.toBeNull();
    const lines = route?.geometry.coordinates ?? [];
    const points = lines.flat();
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.length >= 2)).toBe(true);
    expect(points.every(isCoordinateWithinUkBounds)).toBe(true);
    expect(
      points.some(
        (point) => distanceFromCoordinate(point, HIGH_WYCOMBE_STOP) <= 300,
      ),
    ).toBe(true);
    expect(
      points.some((point) => distanceFromCoordinate(point, TRINITY_STOP) <= 300),
    ).toBe(true);
  });

  it("removes empty and malformed line segments", () => {
    const route = normaliseRouteGeometry({
      ...route37Snapshot,
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [],
          [[-0.75, 51.63]],
          [
            [-0.75, 51.63],
            [Number.NaN, 51.62],
          ],
          [
            [HIGH_WYCOMBE_STOP.longitude, HIGH_WYCOMBE_STOP.latitude],
            [TRINITY_STOP.longitude, TRINITY_STOP.latitude],
          ],
        ],
      },
    });

    expect(route?.geometry.coordinates).toEqual([
      [
        [HIGH_WYCOMBE_STOP.longitude, HIGH_WYCOMBE_STOP.latitude],
        [TRINITY_STOP.longitude, TRINITY_STOP.latitude],
      ],
    ]);
  });

  it("rejects geometry that does not cover the required Route 37 stops", () => {
    expect(
      normaliseRouteGeometry({
        ...route37Snapshot,
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [
              [-3.2, 55.9],
              [-3.1, 55.95],
            ],
          ],
        },
      }),
    ).toBeNull();
  });
});
