import {
  neutralAmbientLight,
  type DashboardState,
  type ForecastPeriod,
} from "../types/dashboard";

interface OpenWeatherCondition {
  id?: unknown;
  description?: unknown;
}

interface OpenWeatherCurrent {
  dt?: unknown;
  main?: {
    temp?: unknown;
    feels_like?: unknown;
    humidity?: unknown;
    temp_max?: unknown;
    temp_min?: unknown;
  };
  wind?: {
    speed?: unknown;
  };
  weather?: OpenWeatherCondition[];
}

interface OpenWeatherForecastItem {
  dt?: unknown;
  main?: {
    temp?: unknown;
  };
  pop?: unknown;
  weather?: OpenWeatherCondition[];
}

interface OpenWeatherForecast {
  list?: OpenWeatherForecastItem[];
}

export interface WeatherConfiguration {
  locationName: string;
  timezone: string;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid weather field: ${field}`);
  }
  return value;
}

function conditionFrom(value: OpenWeatherCondition[] | undefined): {
  conditionId: number;
  description: string;
} {
  const condition = value?.[0];
  if (!condition || typeof condition.description !== "string") {
    throw new Error("Invalid weather condition");
  }

  return {
    conditionId: requiredNumber(condition.id, "weather.id"),
    description: condition.description,
  };
}

export function metresPerSecondToKmh(value: number): number {
  return Math.round(value * 3.6 * 10) / 10;
}

export function normaliseOpenWeather(
  currentPayload: unknown,
  forecastPayload: unknown,
  configuration: WeatherConfiguration,
  now = new Date(),
): DashboardState {
  const current = currentPayload as OpenWeatherCurrent;
  const forecast = forecastPayload as OpenWeatherForecast;

  const currentCondition = conditionFrom(current.weather);
  const currentTimestamp = requiredNumber(current.dt, "current.dt");
  const highTemperatureC = requiredNumber(
    current.main?.temp_max,
    "current.main.temp_max",
  );
  const lowTemperatureC = requiredNumber(
    current.main?.temp_min,
    "current.main.temp_min",
  );

  if (!Array.isArray(forecast.list)) {
    throw new Error("Invalid forecast list");
  }

  const nowSeconds = now.getTime() / 1000;
  const periods: ForecastPeriod[] = forecast.list
    .map((period) => ({
      source: period,
      timestamp: requiredNumber(period.dt, "forecast.dt"),
    }))
    .filter(({ timestamp }) => timestamp > nowSeconds)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, 8)
    .map(({ source, timestamp }) => {
      const condition = conditionFrom(source.weather);
      const probability = requiredNumber(source.pop ?? 0, "forecast.pop");

      return {
        at: new Date(timestamp * 1000).toISOString(),
        temperatureC: requiredNumber(source.main?.temp, "forecast.main.temp"),
        precipitationProbability: Math.round(Math.min(1, Math.max(0, probability)) * 100),
        ...condition,
      };
    });

  if (periods.length !== 8) {
    throw new Error("Forecast did not contain eight future periods");
  }

  return {
    version: 2,
    generatedAt: now.toISOString(),
    weather: {
      status: "ready",
      fetchedAt: now.toISOString(),
      location: {
        name: configuration.locationName,
        timezone: configuration.timezone,
      },
      current: {
        observedAt: new Date(currentTimestamp * 1000).toISOString(),
        temperatureC: requiredNumber(current.main?.temp, "current.main.temp"),
        feelsLikeC: requiredNumber(current.main?.feels_like, "current.main.feels_like"),
        humidityPercent: requiredNumber(current.main?.humidity, "current.main.humidity"),
        highTemperatureC: Math.max(highTemperatureC, lowTemperatureC),
        lowTemperatureC: Math.min(highTemperatureC, lowTemperatureC),
        windKmh: metresPerSecondToKmh(
          requiredNumber(current.wind?.speed, "current.wind.speed"),
        ),
        ...currentCondition,
      },
      forecast: periods,
    },
    ambient: {
      light: { ...neutralAmbientLight },
    },
  };
}
