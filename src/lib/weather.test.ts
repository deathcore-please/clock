import { describe, expect, it } from "vitest";
import { metresPerSecondToKmh, normaliseOpenWeather } from "./weather";

function makePayload(now: Date) {
  const start = Math.floor(now.getTime() / 1000);
  return {
    current: {
      dt: start,
      main: {
        temp: 17.4,
        feels_like: 16.8,
        humidity: 71,
      },
      wind: { speed: 4.1 },
      weather: [{ id: 801, description: "few clouds" }],
    },
    forecast: {
      list: Array.from({ length: 10 }, (_, index) => ({
        dt: start + (index - 1) * 10_800,
        main: { temp: 12 + index },
        pop: index / 10,
        weather: [{ id: index % 2 === 0 ? 800 : 500, description: "forecast" }],
      })),
    },
  };
}

describe("weather normalisation", () => {
  it("converts wind speed to kilometres per hour", () => {
    expect(metresPerSecondToKmh(4.1)).toBe(14.8);
  });

  it("returns the next eight chronological periods", () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    const payload = makePayload(now);
    const state = normaliseOpenWeather(
      payload.current,
      payload.forecast,
      { locationName: "London", timezone: "Europe/London" },
      now,
    );

    expect(state.weather.forecast).toHaveLength(8);
    expect(state.weather.forecast[0].at).toBe("2026-07-29T15:00:00.000Z");
    expect(state.weather.forecast[7].at).toBe("2026-07-30T12:00:00.000Z");
    expect(state.weather.current?.windKmh).toBe(14.8);
    expect(state.weather.current?.highTemperatureC).toBe(17.4);
    expect(state.weather.current?.lowTemperatureC).toBe(14);
  });

  it.each([
    {
      nowAt: "2026-12-05T00:05:00.000Z",
      currentTemperature: 1,
      expectedHigh: 13,
      expectedLow: 1,
    },
    {
      nowAt: "2026-12-05T07:00:00.000Z",
      currentTemperature: 8,
      expectedHigh: 13,
      expectedLow: 2,
    },
    {
      nowAt: "2026-12-05T20:00:00.000Z",
      currentTemperature: 5,
      expectedHigh: 5,
      expectedLow: 2,
    },
  ])(
    "uses only the current reading and remaining December 5 periods at $nowAt",
    ({ nowAt, currentTemperature, expectedHigh, expectedLow }) => {
      const now = new Date(nowAt);
      const payload = makePayload(now);
      payload.current.main.temp = currentTemperature;
      payload.forecast.list = [
        ...[
          { at: "2026-12-05T01:00:00.000Z", temperature: 1 },
          { at: "2026-12-05T07:00:00.000Z", temperature: 8 },
          { at: "2026-12-05T12:00:00.000Z", temperature: 11 },
          { at: "2026-12-05T15:00:00.000Z", temperature: 13 },
          { at: "2026-12-05T20:00:00.000Z", temperature: 5 },
          { at: "2026-12-05T23:00:00.000Z", temperature: 2 },
        ].map(({ at, temperature }) => ({
          dt: Date.parse(at) / 1000,
          main: { temp: temperature },
          pop: 0,
          weather: [{ id: 800, description: "forecast" }],
        })),
        ...Array.from({ length: 8 }, (_, index) => ({
          dt: Date.parse("2026-12-06T02:00:00.000Z") / 1000 + index * 10_800,
          main: { temp: 20 + index },
          pop: 0,
          weather: [{ id: 800, description: "tomorrow" }],
        })),
      ];

      const state = normaliseOpenWeather(
        payload.current,
        payload.forecast,
        { locationName: "High Wycombe", timezone: "Europe/London" },
        now,
      );

      expect(state.weather.current?.highTemperatureC).toBe(expectedHigh);
      expect(state.weather.current?.lowTemperatureC).toBe(expectedLow);
    },
  );

  it("does not roll high and low into tomorrow when today has no forecast slots left", () => {
    const now = new Date("2026-12-05T23:30:00.000Z");
    const payload = makePayload(now);
    payload.current.main.temp = 2;
    payload.forecast.list = Array.from({ length: 8 }, (_, index) => ({
      dt: Date.parse("2026-12-06T02:00:00.000Z") / 1000 + index * 10_800,
      main: { temp: [1, 8, 11, 13, 5, 2, 4, 3][index] },
      pop: 0,
      weather: [{ id: 800, description: "tomorrow" }],
    }));

    const state = normaliseOpenWeather(
      payload.current,
      payload.forecast,
      { locationName: "High Wycombe", timezone: "Europe/London" },
      now,
    );

    expect(state.weather.current?.highTemperatureC).toBe(2);
    expect(state.weather.current?.lowTemperatureC).toBe(2);
  });

  it("rejects malformed provider data", () => {
    expect(() =>
      normaliseOpenWeather(
        {},
        {},
        { locationName: "London", timezone: "Europe/London" },
        new Date(),
      ),
    ).toThrow("Invalid weather condition");
  });
});
