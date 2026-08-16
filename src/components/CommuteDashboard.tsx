import { BusMap } from "./BusMap";
import type { BusState } from "../types/bus";

function phaseLabel(state: BusState | null) {
  if (!state) return "Connecting to live tracking";
  if (state.status === "unavailable") return "Live bus data unavailable";
  if (state.status === "not_tracking") return "Route 37 is not currently tracking";
  if (state.phase === "at_station") return "At High Wycombe Bus Station";
  if (state.phase === "toward_trinity") return "Towards Trinity Church";
  return "Approaching High Wycombe";
}

function punctualityLabel(state: BusState | null) {
  if (!state || state.punctuality.status === "unknown") return "Punctuality unavailable";
  if (state.punctuality.status === "on_time") return "On time";
  const minutes = Math.abs(state.punctuality.deviationMinutes ?? 0);
  return `${minutes} min ${state.punctuality.status}`;
}

function updateLabel(state: BusState | null, now: Date) {
  if (!state?.tracking.recordedAt) return "Waiting for a live position";
  const recordedAt = Date.parse(state.tracking.recordedAt);
  if (!Number.isFinite(recordedAt)) return "Update time unavailable";
  const age = Math.max(0, Math.floor((now.getTime() - recordedAt) / 1_000));
  if (age < 60) return `Updated ${age} sec ago`;
  return `Updated ${Math.floor(age / 60)} min ago`;
}

function selectedVehicleIsStale(state: BusState | null, now: Date) {
  if (!state?.tracking.recordedAt) return state?.status === "stale";
  const recordedAt = Date.parse(state.tracking.recordedAt);
  if (!Number.isFinite(recordedAt)) return state.status === "stale";
  return state.status === "stale" || now.getTime() - recordedAt >= 180_000;
}

export function CommuteDashboard({
  state,
  now,
  clockLabel,
}: {
  state: BusState | null;
  now: Date;
  clockLabel: string;
}) {
  const destination = state?.service.destination;

  return (
    <>
      <section className="commute-clock" aria-label={clockLabel}>
        {clockLabel}
      </section>

      <section className="bus-summary" aria-live="polite">
        <div className="route-badge" aria-label="Route 37">
          37
        </div>
        <div className="bus-summary__copy">
          <p className="bus-eyebrow">
            {destination ? `Towards ${destination}` : "Carousel Buses"}
          </p>
          <h1>{phaseLabel(state)}</h1>
        </div>
        {selectedVehicleIsStale(state, now) ? (
          <span className="stale-badge">Tracking stale</span>
        ) : null}
      </section>

      <section className="bus-map-frame" aria-label="Live bus map">
        <BusMap state={state} />
      </section>

      <section className="bus-metrics" aria-label="Bus tracking details">
        <div>
          <span>Location</span>
          <strong>{updateLabel(state, now)}</strong>
        </div>
        <div>
          <span>Running</span>
          <strong>{punctualityLabel(state)}</strong>
        </div>
        <div>
          <span>Target</span>
          <strong>{state?.target?.name ?? "Trinity Church"}</strong>
        </div>
      </section>
    </>
  );
}
