import '@testing-library/jest-dom/vitest'

// jsdom lacks Canvas; widget components that draw are smoke-tested for mounting
// only, so provide a no-op 2d context to avoid getContext returning null errors.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as never
}
