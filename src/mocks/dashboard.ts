import {
  neutralAmbientLight,
  type DashboardState,
  type ForecastPeriod,
} from "../types/dashboard";

const conditions = [
  {
    conditionId: 801,
    description: "few clouds",
    temperatureC: 17,
    precipitationProbability: 8,
  },
  {
    conditionId: 802,
    description: "scattered clouds",
    temperatureC: 16,
    precipitationProbability: 12,
  },
  {
    conditionId: 500,
    description: "light rain",
    temperatureC: 15,
    precipitationProbability: 48,
  },
  {
    conditionId: 501,
    description: "moderate rain",
    temperatureC: 14,
    precipitationProbability: 66,
  },
  {
    conditionId: 803,
    description: "broken clouds",
    temperatureC: 14,
    precipitationProbability: 22,
  },
  {
    conditionId: 800,
    description: "clear sky",
    temperatureC: 13,
    precipitationProbability: 5,
  },
  {
    conditionId: 800,
    description: "clear sky",
    temperatureC: 12,
    precipitationProbability: 2,
  },
  {
    conditionId: 801,
    description: "few clouds",
    temperatureC: 13,
    precipitationProbability: 6,
  },
];

export function createMockDashboardState(now = new Date()): DashboardState {
  const firstForecast = new Date(now);
  firstForecast.setMinutes(0, 0, 0);
  firstForecast.setHours(firstForecast.getHours() + 3);

  const forecast: ForecastPeriod[] = conditions.map((condition, index) => ({
    ...condition,
    at: new Date(firstForecast.getTime() + index * 3 * 60 * 60 * 1000).toISOString(),
  }));

  return {
    version: 2,
    generatedAt: now.toISOString(),
    weather: {
      status: "ready",
      fetchedAt: now.toISOString(),
      location: {
        name: "London",
        timezone: "Europe/London",
      },
      current: {
        observedAt: now.toISOString(),
        temperatureC: 17.4,
        feelsLikeC: 16.8,
        humidityPercent: 71,
        highTemperatureC: 19.2,
        lowTemperatureC: 12.6,
        windKmh: 14.8,
        conditionId: 801,
        description: "few clouds",
      },
      forecast,
    },
    ambient: {
      light: { ...neutralAmbientLight },
    },
  };
}
