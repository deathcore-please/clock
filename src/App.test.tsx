import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { selectVisibleForecast } from "./App";
import { DASHBOARD_CACHE_KEY } from "./lib/dashboard-cache";
import { createMockDashboardState } from "./mocks/dashboard";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(createMockDashboardState(new Date()))),
  );
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
  Reflect.deleteProperty(document, "fullscreenElement");
  Reflect.deleteProperty(document.documentElement, "requestFullscreen");
});

describe("wall clock dashboard", () => {
  it("renders current weather, six forecast periods, and mock tasks", async () => {
    render(<App />);

    expect(await screen.findByText("few clouds")).toBeInTheDocument();
    expect(screen.getAllByText(/% rain/)).toHaveLength(6);
    expect(screen.queryByText("Next 24 hours")).not.toBeInTheDocument();
    expect(screen.getByText("Take evening medication")).toBeInTheDocument();
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
  });
});
