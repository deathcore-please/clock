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

function localDateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");

  if (!year || !month || !day) {
    throw new Error("Could not determine forecast date");
  }

  return `${year}-${month}-${day}`;
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

  if (!Array.isArray(forecast.list)) {
    throw new Error("Invalid forecast list");
  }

  const nowSeconds = now.getTime() / 1000;
  const futurePeriods = forecast.list
    .map((period) => ({
      source: period,
      timestamp: requiredNumber(period.dt, "forecast.dt"),
      temperatureC: requiredNumber(period.main?.temp, "forecast.main.temp"),
    }))
    .filter(({ timestamp }) => timestamp > nowSeconds)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (futurePeriods.length < 8) {
    throw new Error("Forecast did not contain eight future periods");
  }

  const today = localDateKey(now, configuration.timezone);
  let remainingDayPeriods = futurePeriods.filter(
    ({ timestamp }) =>
      localDateKey(new Date(timestamp * 1000), configuration.timezone) === today,
  );

  if (remainingDayPeriods.length === 0) {
    const nextForecastDay = localDateKey(
      new Date(futurePeriods[0].timestamp * 1000),
      configuration.timezone,
    );
    remainingDayPeriods = futurePeriods.filter(
      ({ timestamp }) =>
        localDateKey(new Date(timestamp * 1000), configuration.timezone) ===
        nextForecastDay,
    );
  }

  const remainingTemperatures = remainingDayPeriods.map(
    ({ temperatureC }) => temperatureC,
  );
  const highTemperatureC = Math.max(...remainingTemperatures);
  const lowTemperatureC = Math.min(...remainingTemperatures);

  const periods: ForecastPeriod[] = futurePeriods
    .slice(0, 8)
    .map(({ source, timestamp, temperatureC }) => {
      const condition = conditionFrom(source.weather);
      const probability = requiredNumber(source.pop ?? 0, "forecast.pop");

      return {
        at: new Date(timestamp * 1000).toISOString(),
        temperatureC,
        precipitationProbability: Math.round(Math.min(1, Math.max(0, probability)) * 100),
        ...condition,
      };
    });

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
        highTemperatureC,
        lowTemperatureC,
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
