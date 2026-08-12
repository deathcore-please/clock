import { useEffect, useMemo, useState } from "react";
import { CommuteDashboard } from "./components/CommuteDashboard";
import { useAmbientLightState } from "./hooks/useAmbientLightState";
import { useBusState } from "./hooks/useBusState";
import { weatherSymbol } from "./lib/condition";
import { getCommuteMode, previewBusScenario } from "./lib/commute-mode";
import { createAmbientTheme } from "./lib/ambient-theme";
import {
  formatClockParts,
  formatDate,
  formatForecastTime,
  formatTemperature,
  formatTimeZoneDifference,
} from "./lib/formatters";
import { useClock } from "./hooks/useClock";
import { useDashboardState } from "./hooks/useDashboardState";
import { useFullscreen } from "./hooks/useFullscreen";
import { useTaskState } from "./hooks/useTaskState";
import { formatTaskAge, getTaskDensity, paginateTasks } from "./lib/tasks";
import { neutralAmbientLight, type ForecastPeriod } from "./types/dashboard";

const VISIBLE_FORECAST_PERIODS = 6;
const TASKS_PER_PAGE = 12;
const TASK_PAGE_INTERVAL_MS = 10_000;
const NEW_DELHI_TIMEZONE = "Asia/Kolkata";

interface ViewOverride {
  scheduledCommute: boolean;
  showCommute: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

const monochromeTheme = createAmbientTheme(neutralAmbientLight);

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
    </article>
  );
}

function Topbar({
  now,
  timezone,
  isFullscreen,
  canFullscreen,
  enterFullscreen,
}: {
  now: Date;
  timezone: string;
  isFullscreen: boolean;
  canFullscreen: boolean;
  enterFullscreen: () => Promise<void>;
}) {
  return (
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
  );
}

export default function App() {
  const dashboardState = useDashboardState();
  const ambientLight = useAmbientLightState();
  const taskState = useTaskState();
  const now = useClock();
  const { isFullscreen, cursorHidden, canFullscreen, enterFullscreen } = useFullscreen();
  const timezone = dashboardState.weather.location.timezone;
  const clock = formatClockParts(now, timezone);
  const newDelhiClock = formatClockParts(now, NEW_DELHI_TIMEZONE);
  const newDelhiDifference = formatTimeZoneDifference(
    now,
    timezone,
    NEW_DELHI_TIMEZONE,
  );
  const commuteMode = getCommuteMode(now, timezone);
  const previewScenario = useMemo(
    () => previewBusScenario(window.location.search, import.meta.env.DEV),
    [],
  );
  const scheduledCommute = commuteMode.visible || previewScenario !== null;
  const [viewOverride, setViewOverride] = useState<ViewOverride | null>(null);
  const showCommute =
    viewOverride?.scheduledCommute === scheduledCommute
      ? viewOverride.showCommute
      : scheduledCommute;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "m" ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      setViewOverride((current) => {
        const currentlyShown =
          current?.scheduledCommute === scheduledCommute
            ? current.showCommute
            : scheduledCommute;

        return {
          scheduledCommute,
          showCommute: !currentlyShown,
        };
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [scheduledCommute]);

  const busState = useBusState({
    enabled: commuteMode.prefetch || previewScenario !== null || showCommute,
    scenario: previewScenario,
    timezone,
  });
  const current = dashboardState.weather.current;
  const visibleForecast = useMemo(
    () => selectVisibleForecast(dashboardState.weather.forecast, now),
    [dashboardState.weather.forecast, now],
  );
  const ambientTheme = useMemo(
    () => (showCommute ? monochromeTheme : createAmbientTheme(ambientLight)),
    [ambientLight, showCommute],
  );
  const taskSignature = useMemo(
    () =>
      taskState.items
        .map((task) => `${task.uid}\u0000${task.summary}\u0000${task.firstSeenAt}`)
        .join("\u0001"),
    [taskState.items],
  );
  const taskPageCount = Math.max(
    1,
    Math.ceil(taskState.items.length / TASKS_PER_PAGE),
  );
  const [taskPage, setTaskPage] = useState(0);

  useEffect(() => {
    setTaskPage(0);
  }, [taskSignature]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") setTaskPage(0);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (taskPageCount <= 1) {
      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    }

    const interval = window.setInterval(() => {
      setTaskPage((current) => (current + 1) % taskPageCount);
    }, TASK_PAGE_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [taskPageCount, taskSignature]);

  const visibleTasks = useMemo(
    () => paginateTasks(taskState.items, taskPage, TASKS_PER_PAGE),
    [taskPage, taskState.items],
  );
  const taskDensity = getTaskDensity(visibleTasks.length);
  const taskHeading = `${taskState.items.length} OPEN${
    taskState.status === "stale" ? " \u00b7 SAVED" : ""
  }`;

  return (
    <main
      className={`viewport-shell${cursorHidden ? " cursor-hidden" : ""}`}
      style={ambientTheme.style}
      data-ambient-theme={ambientTheme.mode}
    >
      <section
        className={`dashboard${showCommute ? " commute-dashboard" : ""}`}
        aria-label={showCommute ? "Route 37 commute dashboard" : "Wall clock and weather dashboard"}
      >
        <Topbar
          now={now}
          timezone={timezone}
          isFullscreen={isFullscreen}
          canFullscreen={canFullscreen}
          enterFullscreen={enterFullscreen}
        />

        {showCommute ? (
          <>
            <CommuteDashboard
              state={busState}
              now={now}
              clockLabel={`${clock.hour}:${clock.minute}:${clock.second}`}
            />
          </>
        ) : (
          <>

        <section className="clock" aria-label={`${clock.hour}:${clock.minute}:${clock.second}`}>
          <span className="clock-time" aria-hidden="true">
            <span>{clock.hour}</span>
            <span className="clock-colon">:</span>
            <span>{clock.minute}</span>
          </span>
          <div
            className="secondary-clock"
            aria-label={`New Delhi time ${newDelhiClock.hour}:${newDelhiClock.minute}, ${newDelhiDifference} GST`}
          >
            <span className="secondary-clock-location">New Delhi</span>
            <time className="secondary-clock-time" dateTime={now.toISOString()}>
              {newDelhiClock.hour}:{newDelhiClock.minute}
            </time>
            <span className="secondary-clock-offset">
              {newDelhiDifference} GST
            </span>
          </div>
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

        <section
          className="tasks-section"
          aria-labelledby="tasks-heading"
          data-density={taskDensity}
        >
          <header className="tasks-heading">
            <h2 id="tasks-heading">Tasks</h2>
            <span>{taskHeading}</span>
          </header>
          {visibleTasks.length > 0 ? (
            <ul aria-label="Open tasks">
              {visibleTasks.map((task) => (
                <li key={task.uid}>
                  <span className="task-marker" aria-hidden="true" />
                  <span className="task-label" title={task.summary}>
                    {task.summary}
                  </span>
                  <span className="task-detail">
                    {formatTaskAge(task.firstSeenAt, now, timezone)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tasks-empty" role="status">
              {taskState.status === "unavailable"
                ? "Tasks unavailable"
                : "No pending tasks"}
            </p>
          )}
        </section>

            <footer>
              {dashboardState.weather.status === "stale"
                ? "Offline \u00b7 showing saved weather"
                : " "}
            </footer>
          </>
        )}
      </section>
    </main>
  );
}
