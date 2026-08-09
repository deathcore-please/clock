export type WeatherStatus = "ready" | "stale" | "unavailable";

export type AmbientThemeMode = "neutral" | "white" | "colour";

export interface AmbientLightState {
  available: boolean;
  on: boolean;
  mode: AmbientThemeMode;
  rgb: [number, number, number];
  brightness: number;
  updatedAt: string | null;
}

export interface CurrentConditions {
  observedAt: string;
  temperatureC: number;
  feelsLikeC: number;
  humidityPercent: number;
  highTemperatureC: number;
  lowTemperatureC: number;
  windKmh: number;
  conditionId: number;
  description: string;
}

export interface ForecastPeriod {
  at: string;
  temperatureC: number;
  precipitationProbability: number;
  conditionId: number;
  description: string;
}

export interface WeatherState {
  status: WeatherStatus;
  fetchedAt: string | null;
  location: {
    name: string;
    timezone: string;
  };
  current: CurrentConditions | null;
  forecast: ForecastPeriod[];
}

export interface DashboardState {
  version: 2;
  generatedAt: string;
  weather: WeatherState;
  ambient: {
    light: AmbientLightState;
  };
}

export const neutralAmbientLight: AmbientLightState = {
  available: false,
  on: false,
  mode: "neutral",
  rgb: [255, 255, 255],
  brightness: 0,
  updatedAt: null,
};
