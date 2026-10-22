import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDisplayFit } from "./useDisplayFit";

let observers: ResizeObserverStub[];
let frames: Map<number, FrameRequestCallback>;

class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(readonly callback: ResizeObserverCallback) {
    observers.push(this);
  }
}

beforeEach(() => {
  Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
  observers = [];
  frames = new Map();
  let nextFrame = 0;
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "fullscreenElement");
});

function createViewport() {
  const ref = createRef<HTMLElement>();
  ref.current = document.createElement("main");
  let width = 1080;
  let height = 1920;
  const measure = vi.spyOn(ref.current, "getBoundingClientRect").mockImplementation(
    () => ({ width, height }) as DOMRect,
  );
  return {
    ref,
    measure,
    resize: (nextWidth: number, nextHeight: number) => {
      width = nextWidth;
      height = nextHeight;
    },
  };
}

function flushFrames() {
  act(() => {
    const pending = Array.from(frames.entries());
    for (const [id, callback] of pending) {
      frames.delete(id);
      callback(0);
    }
  });
}

describe("useDisplayFit", () => {
  it("measures the shell initially and observes its real dimensions", () => {
    const viewport = createViewport();
    const { result } = renderHook(() => useDisplayFit(viewport.ref));

    expect(result.current).toEqual({
      width: 1080, height: 1920, left: 0, top: 0, transform: "scale(1)",
    });
    expect(observers[0].observe).toHaveBeenCalledWith(viewport.ref.current);
  });

  it("coalesces observer, resize and fullscreen changes into one frame", () => {
    const viewport = createViewport();
    const { result } = renderHook(() => useDisplayFit(viewport.ref));
    viewport.resize(720, 1280);

    act(() => {
      observers[0].callback([], observers[0]);
      window.dispatchEvent(new Event("resize"));
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(window.requestAnimationFrame).toHaveBeenCalledOnce();
    expect(viewport.measure).toHaveBeenCalledOnce();
    flushFrames();
    expect(viewport.measure).toHaveBeenCalledTimes(2);
    expect(result.current.transform).toBe(`scale(${2 / 3})`);
    expect(result.current.left).toBe(0);
    expect(result.current.top).toBe(0);
  });

  it("refits windowed, F11 and page fullscreen without depending on API state", () => {
    const viewport = createViewport();
    const { result } = renderHook(() => useDisplayFit(viewport.ref));
    viewport.resize(1080, 1733);
    window.dispatchEvent(new Event("resize"));
    flushFrames();
    expect(result.current.left).toBeCloseTo(52.59375);

    // F11 changes the viewport but does not set document.fullscreenElement.
    expect(document.fullscreenElement).toBeNull();
    viewport.resize(1080, 1920);
    window.dispatchEvent(new Event("resize"));
    flushFrames();
    expect(result.current.transform).toBe("scale(1)");
    expect(result.current.left).toBe(0);

    viewport.resize(540, 1200);
    document.dispatchEvent(new Event("fullscreenchange"));
    flushFrames();
    expect(result.current.transform).toBe("scale(0.5)");
    expect(result.current.top).toBe(120);
  });

  it("keeps the current fit when measurements have not changed", () => {
    const viewport = createViewport();
    const { result } = renderHook(() => useDisplayFit(viewport.ref));
    const initialStyle = result.current;
    window.dispatchEvent(new Event("resize"));
    flushFrames();
    expect(result.current).toBe(initialStyle);
  });

  it("disconnects and cancels pending work when unmounted", () => {
    const viewport = createViewport();
    const { unmount } = renderHook(() => useDisplayFit(viewport.ref));
    window.dispatchEvent(new Event("resize"));
    unmount();

    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(frames.size).toBe(0);
    window.dispatchEvent(new Event("resize"));
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(window.requestAnimationFrame).toHaveBeenCalledOnce();
  });
});
