import { describe, expect, it } from "vitest";
import { DISPLAY_HEIGHT, DISPLAY_WIDTH, fitDisplayCanvas } from "./display-fit";

describe("portrait canvas fitting", () => {
  it("fills the reference display without an offset", () => {
    expect(fitDisplayCanvas(DISPLAY_WIDTH, DISPLAY_HEIGHT)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });

  it("scales the entire canvas proportionally on smaller portrait displays", () => {
    expect(fitDisplayCanvas(720, 1280)).toEqual({ scale: 2 / 3, x: 0, y: 0 });
  });

  it("centres a height-limited windowed preview", () => {
    const fit = fitDisplayCanvas(1080, 1733);
    expect(fit.scale).toBeCloseTo(1733 / 1920);
    expect(fit.x).toBeCloseTo(52.59375);
    expect(fit.y).toBe(0);
    expect(fit.x + DISPLAY_WIDTH * fit.scale).toBeLessThanOrEqual(1080);
  });

  it("letterboxes the portrait canvas in a landscape window", () => {
    expect(fitDisplayCanvas(1920, 1080)).toEqual({
      scale: 0.5625,
      x: 656.25,
      y: 0,
    });
  });

  it("centres a width-limited preview vertically", () => {
    expect(fitDisplayCanvas(540, 1200)).toEqual({ scale: 0.5, x: 0, y: 120 });
  });

  it("can scale up and remains finite before the viewport is measured", () => {
    expect(fitDisplayCanvas(2160, 3840)).toEqual({ scale: 2, x: 0, y: 0 });
    expect(fitDisplayCanvas(0, 0)).toEqual({ scale: 0, x: 0, y: 0 });
  });
});
