import { describe, expect, it } from "vitest";
import { createAmbientTheme } from "./ambient-theme";
import { neutralAmbientLight, type AmbientLightState } from "../types/dashboard";

function bulb(overrides: Partial<AmbientLightState>): AmbientLightState {
  return {
    available: true,
    on: true,
    mode: "colour",
    rgb: [255, 0, 0],
    brightness: 255,
    updatedAt: "2026-08-09T12:00:00.000Z",
    ...overrides,
  };
}

describe("ambient dashboard theme", () => {
  it.each([
    neutralAmbientLight,
    bulb({ available: true, on: false, mode: "neutral" }),
    bulb({ available: false, on: false, mode: "neutral" }),
  ])("uses the original monochrome palette for a neutral bulb state", (light) => {
    const theme = createAmbientTheme(light);
    expect(theme.mode).toBe("neutral");
    expect(theme.style["--display-background"]).toBe("rgb(0, 0, 0)");
    expect(theme.style["--display-ink"]).toBe("rgb(247, 247, 244)");
    expect(theme.style["--card-background"]).toBe("rgba(247, 247, 244, 0.035)");
    expect(theme.style["--card-ink"]).toBe("rgb(247, 247, 244)");
  });

  it("uses black ink for white mode", () => {
    const theme = createAmbientTheme(bulb({ mode: "white", rgb: [255, 255, 255] }));
    expect(theme.style["--display-background"]).toBe("rgb(255, 255, 255)");
    expect(theme.style["--display-ink"]).toBe("rgb(0, 0, 0)");
    expect(theme.style["--card-background"]).toBe("rgb(0, 0, 0)");
    expect(theme.style["--card-ink"]).toBe("rgb(255, 255, 255)");
    expect(theme.style["--card-muted"]).toBe("rgba(255, 255, 255, 0.66)");
  });

  it("uses black ink on a bright colour", () => {
    const theme = createAmbientTheme(bulb({ rgb: [255, 230, 0] }));
    expect(theme.style["--display-background"]).toBe("rgb(255, 230, 0)");
    expect(theme.style["--display-ink"]).toBe("rgb(0, 0, 0)");
    expect(theme.style["--card-background"]).toBe("rgb(0, 0, 0)");
    expect(theme.style["--card-placeholder-background"]).toBe("rgb(0, 0, 0)");
    expect(theme.style["--card-ink"]).toBe("rgb(255, 230, 0)");
    expect(theme.style["--card-line"]).toBe("rgba(255, 230, 0, 0.28)");
  });

  it("uses white ink on a dark colour", () => {
    const theme = createAmbientTheme(bulb({ rgb: [30, 0, 70] }));
    expect(theme.style["--display-background"]).toBe("rgb(30, 0, 70)");
    expect(theme.style["--display-ink"]).toBe("rgb(255, 255, 255)");
    expect(theme.style["--card-background"]).toBe("rgba(255, 255, 255, 0.035)");
    expect(theme.style["--card-placeholder-background"]).toBe(
      "rgba(255, 255, 255, 0.025)",
    );
    expect(theme.style["--card-ink"]).toBe("rgb(255, 255, 255)");
  });

  it("ignores brightness when choosing the colour background", () => {
    const dim = createAmbientTheme(bulb({ rgb: [40, 100, 160], brightness: 1 }));
    const bright = createAmbientTheme(bulb({ rgb: [40, 100, 160], brightness: 255 }));
    expect(dim).toEqual(bright);
  });
});
