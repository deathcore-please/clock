import type { CSSProperties } from "react";
import type { AmbientLightState } from "../types/dashboard";

const NEUTRAL_BACKGROUND: [number, number, number] = [0, 0, 0];
const NEUTRAL_INK: [number, number, number] = [247, 247, 244];
const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];

type ThemeVariables = CSSProperties & Record<`--${string}`, string>;

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
  const ink = mode === "neutral" ? NEUTRAL_INK : BLACK;
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
