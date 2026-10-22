import "@testing-library/jest-dom/vitest";

// JSDOM has no layout engine; individual sizing tests provide observer callbacks.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

