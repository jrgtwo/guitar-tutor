import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver. Stub it out so components that use
// it for layout measurement (e.g. PlaybackRibbonRow) can render in tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
