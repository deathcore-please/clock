export const DISPLAY_WIDTH = 1080;
export const DISPLAY_HEIGHT = 1920;

export function fitDisplayCanvas(width: number, height: number) {
  const scale = Math.min(width / DISPLAY_WIDTH, height / DISPLAY_HEIGHT);

  return {
    scale,
    x: (width - DISPLAY_WIDTH * scale) / 2,
    y: (height - DISPLAY_HEIGHT * scale) / 2,
  };
}
