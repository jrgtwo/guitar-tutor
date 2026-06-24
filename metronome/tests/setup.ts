import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver. Stub it out so any lib component that
// uses it for layout measurement can render in tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
