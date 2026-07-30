import { useMemo, type CSSProperties } from "react";
import { weatherSymbol } from "./lib/condition";
import {
  formatClockParts,
  formatDate,
  formatForecastTime,
  formatTemperature,
} from "./lib/formatters";
import { useClock } from "./hooks/useClock";
import { useDashboardState } from "./hooks/useDashboardState";
import { useFullscreen } from "./hooks/useFullscreen";
import type { AmbientLightState, ForecastPeriod } from "./types/dashboard";

const mockTasks = [
  { label: "Cancel passport issue application", detail: "Today" },
  { label: "Make Black Metal", detail: "Tonight" },
  { label: "Donate Clothes", detail: "Today" },
  { label: "Install Silent Hill Origins for PSP", detail: "Tomorrow" },
];

const VISIBLE_FORECAST_PERIODS = 6;

function ambientStyle(light: AmbientLightState) {
  const [red, green, blue] = light.rgb;
  return {
    "--ambient-rgb": `${red}, ${green}, ${blue}`,
    "--ambient-strength": light.available && light.on ? light.brightness / 255 : 0.08,
  } as CSSProperties;
}

export function selectVisibleForecast(
  forecast: ForecastPeriod[],
  now: Date,
): ForecastPeriod[] {
  if (forecast.length <= VISIBLE_FORECAST_PERIODS) return forecast;

  const firstCurrentOrFuture = forecast.findIndex(
    (period) => Date.parse(period.at) >= now.getTime(),
  );
  const latestPossibleStart = forecast.length - VISIBLE_FORECAST_PERIODS;
  const start =
    firstCurrentOrFuture === -1
      ? latestPossibleStart
      : Math.min(firstCurrentOrFuture, latestPossibleStart);

  return forecast.slice(start, start + VISIBLE_FORECAST_PERIODS);
}

function ForecastCard({
  period,
  timezone,
}: {
  period: ForecastPeriod;
  timezone: string;
}) {
  return (
    <article className="forecast-card">
      <time dateTime={period.at}>{formatForecastTime(period.at, timezone)}</time>
      <span className="forecast-icon" aria-hidden="true">
        {weatherSymbol(period.conditionId, period.at, timezone)}
      </span>
      <strong>{formatTemperature(period.temperatureC)}</strong>
      <span className="rain-chance">{period.precipitationProbability}% rain</span>
    </article>
  );
}

export default function App() {
  const dashboardState = useDashboardState();
  const now = useClock();
  const { isFullscreen, cursorHidden, canFullscreen, enterFullscreen } = useFullscreen();
  const timezone = dashboardState.weather.location.timezone;
  const clock = formatClockParts(now, timezone);
  const current = dashboardState.weather.current;
  const visibleForecast = useMemo(
    () => selectVisibleForecast(dashboardState.weather.forecast, now),
    [dashboardState.weather.forecast, now],
  );
  const ambient = useMemo(
    () => ambientStyle(dashboardState.ambient.light),
    [dashboardState.ambient.light],
  );

  return (
    <main
      className={`viewport-shell${cursorHidden ? " cursor-hidden" : ""}`}
      style={ambient}
    >
      <section className="dashboard" aria-label="Wall clock and weather dashboard">
        <header className="topbar">
          <p className="date">{formatDate(now, timezone)}</p>
          {!isFullscreen && canFullscreen ? (
            <button
              className="fullscreen-button"
              type="button"
              onClick={() => void enterFullscreen()}
              aria-label="Enter fullscreen"
            >
              Full screen
            </button>
          ) : null}
        </header>

        <section className="clock" aria-label={`${clock.hour}:${clock.minute}:${clock.second}`}>
          <span className="clock-time" aria-hidden="true">
            <span>{clock.hour}</span>
            <span className="clock-colon">:</span>
            <span>{clock.minute}</span>
          </span>
          <span className="seconds">{clock.second}</span>
        </section>

        {current ? (
          <section className="current-weather" aria-label="Current weather">
            <div className="current-summary">
              <span className="current-icon" aria-hidden="true">
                {weatherSymbol(current.conditionId, current.observedAt, timezone)}
              </span>
              <div>
                <p className="temperature">{formatTemperature(current.temperatureC)}</p>
                <p className="condition">{current.description}</p>
              </div>
            </div>
            <dl className="weather-details">
              <div>
                <dt>Feels like</dt>
                <dd>{formatTemperature(current.feelsLikeC)}</dd>
              </div>
              <div>
                <dt>Humidity</dt>
                <dd>{Math.round(current.humidityPercent)}%</dd>
              </div>
              <div>
                <dt>High / Low</dt>
                <dd>
                  {formatTemperature(current.highTemperatureC)}
                  {" / "}
                  {formatTemperature(current.lowTemperatureC)}
                </dd>
              </div>
            </dl>
          </section>
        ) : (
          <section className="weather-unavailable" role="status">
            <span aria-hidden="true">{"\u2014"}</span>
            <div>
              <strong>Weather unavailable</strong>
              <p>The clock will keep running while the connection recovers.</p>
            </div>
          </section>
        )}

        <section className="forecast-section" aria-label="Upcoming weather forecast">
          {visibleForecast.length === VISIBLE_FORECAST_PERIODS ? (
            <div className="forecast-grid">
              {visibleForecast.map((period) => (
                <ForecastCard key={period.at} period={period} timezone={timezone} />
              ))}
            </div>
          ) : (
            <div className="forecast-placeholder" aria-hidden="true">
              {Array.from({ length: VISIBLE_FORECAST_PERIODS }, (_, index) => (
                <span key={index} />
              ))}
            </div>
          )}
        </section>

        <section className="tasks-section" aria-labelledby="tasks-heading">
          <header className="tasks-heading">
            <h2 id="tasks-heading">Tasks</h2>
            <span>Mock list</span>
          </header>
          <ul>
            {mockTasks.map((task) => (
              <li key={task.label}>
                <span className="task-marker" aria-hidden="true" />
                <span className="task-label">{task.label}</span>
                <span className="task-detail">{task.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <footer>
          {dashboardState.weather.status === "stale"
            ? "Offline \u00b7 showing saved weather"
            : " "}
        </footer>
      </section>
    </main>
  );
}
