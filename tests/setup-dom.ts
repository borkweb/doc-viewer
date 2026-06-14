// Global DOM environment for `bun test`.
//
// bun has no per-file test environment, so DOM globals are registered here via
// a preload (see bunfig.toml). This file is the equivalent of vitest's old
// `environmentMatchGlobs: [['tests/render.test.ts', 'jsdom']]`.
//
// We use jsdom rather than @happy-dom/global-registrator: the renderer's
// DOMPurify-based sanitizer (renderMarkdown) relies on the DOM spec's
// NodeIterator "removing steps" (the iterator's reference node is adjusted when
// a node is removed mid-traversal). happy-dom does not implement that, so
// DOMPurify silently fails to strip an element that has children (e.g.
// `<script>x</script>`) — the XSS-sanitization tests would pass through unsafe
// HTML. jsdom implements it correctly and preserves full test coverage.
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
  url: 'http://localhost/'
})

const win = dom.window as unknown as Record<string, unknown>
const g = globalThis as unknown as Record<string, unknown>

// Register the DOM globals the renderer code touches. `navigator` is read-only
// on the bun global, so it is intentionally left as bun's own.
for (const key of [
  'window',
  'document',
  'DOMParser',
  'Node',
  'NodeList',
  'NodeFilter',
  'Element',
  'HTMLElement',
  'HTMLDivElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLSelectElement',
  'HTMLOptionElement',
  'HTMLHeadingElement',
  'DocumentFragment',
  'Text',
  'Comment',
  'MutationObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame'
]) {
  if (key in win) g[key] = win[key]
}

// `window` should point at the jsdom window object itself.
g.window = dom.window

// React 19's `act()` requires this flag to flush updates synchronously without
// warning. Component tests dispatch DOM events via jsdom's window-scoped
// `Event` (`window.Event`), so we deliberately do NOT override Node's global
// `Event` here — the main-process AbortController tests depend on it.
g.IS_REACT_ACT_ENVIRONMENT = true
