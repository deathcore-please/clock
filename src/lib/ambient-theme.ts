import type { CSSProperties } from "react";
import type { AmbientLightState } from "../types/dashboard";

const NEUTRAL_BACKGROUND: [number, number, number] = [0, 0, 0];
const NEUTRAL_INK: [number, number, number] = [247, 247, 244];
const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];

type ThemeVariables = CSSProperties & Record<`--${string}`, string>;

function channelLuminance(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([red, green, blue]: [number, number, number]): number {
  return (
    0.2126 * channelLuminance(red) +
    0.7152 * channelLuminance(green) +
    0.0722 * channelLuminance(blue)
  );
}

function contrastingInk(background: [number, number, number]): [number, number, number] {
  const luminance = relativeLuminance(background);
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? BLACK : WHITE;
}

function rgbValue([red, green, blue]: [number, number, number]): string {
  return `rgb(${red}, ${green}, ${blue})`;
}

export interface AmbientTheme {
  mode: "neutral" | "white" | "colour";
  style: ThemeVariables;
}

export function createAmbientTheme(light: AmbientLightState): AmbientTheme {
  const usable = light.available && light.on;
  const mode = usable ? light.mode : "neutral";
  const background =
    mode === "white" ? WHITE : mode === "colour" ? light.rgb : NEUTRAL_BACKGROUND;
  const ink = mode === "neutral" ? NEUTRAL_INK : contrastingInk(background);
  const inkChannels = ink.join(", ");
  const usesBlackInk = ink.every((channel) => channel === 0);
  const cardInk = usesBlackInk ? background : ink;
  const cardInkChannels = cardInk.join(", ");

  return {
    mode,
    style: {
      "--display-background": rgbValue(background),
      "--display-ink": rgbValue(ink),
      "--display-muted": `rgba(${inkChannels}, 0.66)`,
      "--display-faint": `rgba(${inkChannels}, 0.035)`,
      "--display-line": `rgba(${inkChannels}, 0.28)`,
      "--display-line-soft": `rgba(${inkChannels}, 0.14)`,
      "--card-background": usesBlackInk
        ? rgbValue(BLACK)
        : `rgba(${inkChannels}, 0.035)`,
      "--card-placeholder-background": usesBlackInk
        ? rgbValue(BLACK)
        : `rgba(${inkChannels}, 0.025)`,
      "--card-ink": rgbValue(cardInk),
      "--card-muted": `rgba(${cardInkChannels}, 0.66)`,
      "--card-line": `rgba(${cardInkChannels}, 0.28)`,
      "--card-line-soft": `rgba(${cardInkChannels}, 0.14)`,
      "--ambient-rgb": inkChannels,
    },
  };
}
