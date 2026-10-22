import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { DISPLAY_HEIGHT, DISPLAY_WIDTH, fitDisplayCanvas } from "../lib/display-fit";

export function useDisplayFit(viewportRef: RefObject<HTMLElement | null>): CSSProperties {
  const [fit, setFit] = useState(() => fitDisplayCanvas(0, 0));

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    let frame: number | null = null;
    const measure = () => {
      frame = null;
      const { width, height } = viewport.getBoundingClientRect();
      const next = fitDisplayCanvas(width, height);
      setFit((current) =>
        current.scale === next.scale && current.x === next.x && current.y === next.y
          ? current
          : next,
      );
    };
    const scheduleMeasure = () => {
      if (frame === null) frame = window.requestAnimationFrame(measure);
    };

    measure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(viewport);
    window.addEventListener("resize", scheduleMeasure);
    document.addEventListener("fullscreenchange", scheduleMeasure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      document.removeEventListener("fullscreenchange", scheduleMeasure);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [viewportRef]);

  return {
    width: DISPLAY_WIDTH,
    height: DISPLAY_HEIGHT,
    left: fit.x,
    top: fit.y,
    transform: `scale(${fit.scale})`,
  };
}
