import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./components/BusMap", () => ({
  BusMap: () => <div data-testid="bus-map" />,
}));
import App, { selectVisibleForecast } from "./App";
import { DASHBOARD_CACHE_KEY } from "./lib/dashboard-cache";
import { createMockBusState } from "./mocks/bus";
import { createMockDashboardState } from "./mocks/dashboard";
import { neutralAmbientLight, type AmbientLightState } from "./types/dashboard";

function dashboardFetch(ambient: AmbientLightState = neutralAmbientLight) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/api/ambient-state")) {
      return Response.json(ambient, { headers: { "Cache-Control": "no-store" } });
    }
    if (url.includes("/api/bus-state")) {
      const scenario = new URL(url, "http://localhost").searchParams.get("scenario");
      return Response.json(
        createMockBusState(
          scenario === "outbound" ||
            scenario === "inbound" ||
            scenario === "stale" ||
            scenario === "untracked"
            ? scenario
            : "station",
          new Date(),
        ),
      );
    }
    return Response.json(createMockDashboardState(new Date()));
  });
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.stubGlobal("fetch", dashboardFetch());
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => null,
  });
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
  Reflect.deleteProperty(document, "fullscreenElement");
  Reflect.deleteProperty(document.documentElement, "requestFullscreen");
});

describe("wall clock dashboard", () => {
  it("renders current weather, six forecast periods, and mock tasks", async () => {
    render(<App />);

    expect(await screen.findByText("few clouds")).toBeInTheDocument();
    expect(screen.getAllByText(/% rain/)).toHaveLength(6);
    expect(screen.queryByText("Next 24 hours")).not.toBeInTheDocument();
    expect(screen.getByText("Cancel passport issue application")).toBeInTheDocument();
    expect(screen.queryByText("London")).not.toBeInTheDocument();
    expect(screen.getByText("High / Low")).toBeInTheDocument();
    expect(screen.queryByText("Wind")).not.toBeInTheDocument();
  });

  it("advances the visible forecast window as periods pass", () => {
    const state = createMockDashboardState(new Date("2026-07-29T09:00:00Z"));
    const firstWindow = selectVisibleForecast(
      state.weather.forecast,
      new Date("2026-07-29T09:00:00Z"),
    );
    const laterWindow = selectVisibleForecast(
      state.weather.forecast,
      new Date("2026-07-29T16:00:00Z"),
    );

    expect(firstWindow).toHaveLength(6);
    expect(laterWindow).toHaveLength(6);
    expect(laterWindow[0].at).not.toBe(firstWindow[0].at);
  });

  it("enters fullscreen from the visible control", async () => {
    render(<App />);
    const button = screen.getByRole("button", { name: "Enter fullscreen" });
    fireEvent.click(button);
    await waitFor(() =>
      expect(document.documentElement.requestFullscreen).toHaveBeenCalledOnce(),
    );
  });

  it("hides the cursor after three idle seconds in fullscreen", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.documentElement,
    });

    const { container } = render(<App />);
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    act(() => {
      vi.advanceTimersByTime(3_001);
    });
    expect(container.querySelector(".viewport-shell")).toHaveClass("cursor-hidden");

    fireEvent.pointerMove(document);
    expect(container.querySelector(".viewport-shell")).not.toHaveClass("cursor-hidden");
    vi.useRealTimers();
  });

  it("uses saved weather when the network is unavailable", async () => {
    localStorage.setItem(
      DASHBOARD_CACHE_KEY,
      JSON.stringify(createMockDashboardState(new Date("2026-07-29T12:00:00Z"))),
    );
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));

    render(<App />);

    expect(await screen.findByText(/Offline.*showing saved weather/)).toBeInTheDocument();
  });

  it("keeps the clock visible when no weather has ever loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));

    render(<App />);

    expect(await screen.findByText("Weather unavailable")).toBeInTheDocument();
    expect(screen.getByLabelText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    expect(document.querySelector(".viewport-shell")).toHaveStyle({
      "--display-background": "rgb(0, 0, 0)",
      "--display-ink": "rgb(247, 247, 244)",
    });
  });

  it("applies a live bulb colour to the normal dashboard", async () => {
    vi.stubGlobal(
      "fetch",
      dashboardFetch({
        available: true,
        on: true,
        mode: "colour",
        rgb: [255, 220, 0],
        brightness: 3,
        updatedAt: new Date().toISOString(),
      }),
    );
    const { container } = render(<App />);
    const shell = container.querySelector(".viewport-shell");
    await waitFor(() => expect(shell).toHaveAttribute("data-ambient-theme", "colour"));
    expect(shell).toHaveStyle({
      "--display-background": "rgb(255, 220, 0)",
      "--display-ink": "rgb(0, 0, 0)",
    });
  });

  it.each<AmbientLightState>([
    {
      available: true,
      on: true,
      mode: "white",
      rgb: [255, 255, 255],
      brightness: 255,
      updatedAt: new Date().toISOString(),
    },
    {
      available: true,
      on: true,
      mode: "colour",
      rgb: [255, 0, 0],
      brightness: 255,
      updatedAt: new Date().toISOString(),
    },
    { ...neutralAmbientLight },
  ])("forces commute mode to the original monochrome palette", async (ambient) => {
    window.history.replaceState({}, "", "/?previewBus=station");
    const fetcher = dashboardFetch(ambient);
    vi.stubGlobal("fetch", fetcher);
    const { container } = render(<App />);
    expect(await screen.findByLabelText("Route 37 commute dashboard")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        "/api/ambient-state",
        expect.objectContaining({ cache: "no-store" }),
      ),
    );
    expect(container.querySelector(".viewport-shell")).toHaveStyle({
      "--display-background": "rgb(0, 0, 0)",
      "--display-ink": "rgb(247, 247, 244)",
    });
  });

  it.each([
    ["station", "At High Wycombe Bus Station"],
    ["outbound", "Towards Trinity Church"],
    ["inbound", "Approaching High Wycombe"],
    ["stale", "Towards Trinity Church"],
    ["untracked", "Route 37 is not currently tracking"],
  ])("renders the %s commute preview", async (scenario, heading) => {
    window.history.replaceState({}, "", `/?previewBus=${scenario}`);
    render(<App />);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByTestId("bus-map")).toBeInTheDocument();
    expect(screen.queryByText("Tasks")).not.toBeInTheDocument();
    expect(screen.queryByText(/Approx\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/normal dashboard returns/i)).not.toBeInTheDocument();
    if (scenario === "stale") {
      expect(screen.getByText("Tracking stale")).toBeInTheDocument();
    }
  });

  it("enters at 08:08 and returns to the normal dashboard at 08:30", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T07:07:59Z"));
    render(<App />);
    expect(screen.getByText("Tasks")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });
    expect(screen.getByLabelText("Route 37 commute dashboard")).toBeInTheDocument();

    await act(async () => {
      vi.setSystemTime(new Date("2026-08-03T07:30:00Z"));
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.queryByTestId("bus-map")).not.toBeInTheDocument();
  });

  it("toggles between the normal and commute dashboards with the M key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T11:00:00Z"));
    render(<App />);

    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.queryByTestId("bus-map")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "m" });
    expect(screen.getByLabelText("Route 37 commute dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("bus-map")).toBeInTheDocument();
    expect(screen.queryByText("Tasks")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "M" });
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.queryByTestId("bus-map")).not.toBeInTheDocument();
  });

  it("ignores modified, repeated, and typing-field M key presses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T11:00:00Z"));
    render(<App />);

    fireEvent.keyDown(window, { key: "m", ctrlKey: true });
    fireEvent.keyDown(window, { key: "m", altKey: true });
    fireEvent.keyDown(window, { key: "m", metaKey: true });
    fireEvent.keyDown(window, { key: "m", repeat: true });

    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "m" });
    input.remove();

    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.queryByTestId("bus-map")).not.toBeInTheDocument();
  });
});
