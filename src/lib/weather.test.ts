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
        temp_max: 19.2,
        temp_min: 12.6,
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
    expect(state.weather.current?.highTemperatureC).toBe(19.2);
    expect(state.weather.current?.lowTemperatureC).toBe(12.6);
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
