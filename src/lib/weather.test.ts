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
        temp_max: 99,
        temp_min: -99,
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
    expect(state.weather.current?.highTemperatureC).toBe(16);
    expect(state.weather.current?.lowTemperatureC).toBe(14);
  });

  it("uses only remaining periods in the local day for high and low", () => {
    const now = new Date("2026-07-29T17:30:00.000Z");
    const payload = makePayload(now);
    payload.forecast.list = [
      {
        dt: Date.parse("2026-07-29T15:00:00.000Z") / 1000,
        main: { temp: 28 },
        pop: 0,
        weather: [{ id: 800, description: "past high" }],
      },
      ...Array.from({ length: 8 }, (_, index) => ({
        dt: Date.parse("2026-07-29T18:00:00.000Z") / 1000 + index * 10_800,
        main: { temp: [21, 16, 12, 10, 14, 24, 22, 18][index] },
        pop: 0,
        weather: [{ id: 800, description: "forecast" }],
      })),
    ];

    const state = normaliseOpenWeather(
      payload.current,
      payload.forecast,
      { locationName: "High Wycombe", timezone: "Europe/London" },
      now,
    );

    expect(state.weather.current?.highTemperatureC).toBe(21);
    expect(state.weather.current?.lowTemperatureC).toBe(16);
  });

  it("rolls high and low forward to the next forecast day after midnight cutoff", () => {
    const now = new Date("2026-07-29T22:30:00.000Z");
    const payload = makePayload(now);
    const nextPeriod = Date.parse("2026-07-30T00:00:00.000Z") / 1000;
    payload.forecast.list = Array.from({ length: 8 }, (_, index) => ({
      dt: nextPeriod + index * 10_800,
      main: { temp: [15, 12, 14, 20, 25, 23, 19, 16][index] },
      pop: 0,
      weather: [{ id: 800, description: "forecast" }],
    }));

    const state = normaliseOpenWeather(
      payload.current,
      payload.forecast,
      { locationName: "High Wycombe", timezone: "Europe/London" },
      now,
    );

    expect(state.weather.current?.highTemperatureC).toBe(25);
    expect(state.weather.current?.lowTemperatureC).toBe(12);
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
