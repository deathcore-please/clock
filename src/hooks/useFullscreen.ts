import { useCallback, useEffect, useRef, useState } from "react";

const CURSOR_IDLE_MS = 3_000;

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(
    () => document.fullscreenElement !== null,
  );
  const [cursorHidden, setCursorHidden] = useState(false);
  const timer = useRef<number | null>(null);

  const resetCursorTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
    }

    setCursorHidden(false);
    if (document.fullscreenElement) {
      timer.current = window.setTimeout(() => setCursorHidden(true), CURSOR_IDLE_MS);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement !== null;
      setIsFullscreen(active);
      setCursorHidden(false);
      resetCursorTimer();
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("pointermove", resetCursorTimer);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("pointermove", resetCursorTimer);
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
    };
  }, [resetCursorTimer]);

  const enterFullscreen = useCallback(async () => {
    await document.documentElement.requestFullscreen();
  }, []);

  return {
    isFullscreen,
    cursorHidden,
    canFullscreen: typeof document.documentElement.requestFullscreen === "function",
    enterFullscreen,
  };
}

