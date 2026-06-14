# Plan 4 — File Watch, Session Memory & Command Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each task is TDD: write a failing test, run it (expect FAIL), implement complete code (no placeholders), run it (expect PASS), typecheck/build where relevant, then commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Curator feel *live* and *fast to navigate* with three independent quality-of-life features, each its own reviewable PR, shipped in order **E3 → E4 → E2**: session memory (restore where you were, per project), a ⌘K command palette (jump to any project/doc/command), and file-watch + live reindex (edits on disk auto-refresh the open doc).

**Architecture:** All three slices are additive to the existing App-as-controller renderer + main-owns-Node split. **E3** adds `lib/session.ts` (localStorage, mirrors `lib/theme.ts`) and an App-level capture/restore loop with a *parallel* DocView scroll-restore path (does **not** overload `scrollToId`/`scrollNonce`). **E4** adds `CommandPalette.tsx` + a hand-rolled `lib/fuzzy.ts` rank-only scorer and a single App-level ⌘K/Ctrl+K keydown. **E2** adds `src/main/watcher.ts` (`fs.watch`, injectable, 300 ms trailing-debounced) wired into `selectProject`'s local path, plus a new `index:changed` main→renderer push channel that the watcher reaches through a `webContents` sink captured at window creation in `src/main/index.ts`.

**Tech Stack:** Electron, electron-vite, React 19, TypeScript, `bun test` (native runner, `import from 'bun:test'`), jsdom renderer tests via the `bunfig.toml` preload (`react-dom/client` `createRoot` + `act` + `React.createElement`). **NO npm-install** — Node built-ins only (`node:fs` watch, hand-rolled fuzzy scorer, `localStorage`).

**Spec:** `docs/superpowers/specs/2026-06-14-plan-4-watch-session-palette-design.md` (source of truth for scope, states, copy). **Predecessors:** Plan 1 (local viewer), Plan 2a/2b (GitHub backend + UI), Plan 3 (Manage Projects).

---

## Reconciliation with current code (read before starting)

- **`src/renderer/src/App.tsx`** already holds `projects`, `activeId`, `tree`, `docPath`, `scrollToId`, `scrollNonce`, `toc`, `stats`, theme state (`theme`, `systemDark`, `resolveTheme`), `view: 'docs' | 'manage'`, `addOpen`, `settingsOpen`, and the callbacks `refreshProjects`, `resetDocState`, `selectProject`, `openDoc`, `openResult`, `jumpTo`, `rebuild`, `switchRef`, `addRef`, `removeRef`. A module-level **`treeHasPath(nodes, path)`** helper already exists (App.tsx lines 32–41, added in Plan 3) and is reused verbatim by E3 and E2 — **do not redefine it**. `findDocTitle` sits beside it. The mount effect is `useEffect(() => { void refreshProjects() }, [refreshProjects])` — E3 **replaces** this with a combined load-then-restore launch effect.
- **`src/renderer/src/components/DocView.tsx`** renders sanitized markdown imperatively into `<div ref={ref} />`, and only scrolls **after** `enhanceDiagrams(container).then(...)`. It keeps the live `scrollToId` in `targetRef` (a ref, read by both effects without re-running the render effect). E3 adds a **parallel** `restoreHeadingId` path inside that same `.then`; E2 adds a `reloadNonce` to the `getDoc` effect deps so a live re-index forces a refetch. **DocView's scroll container is the parent `<main className="content">`** (`styles.css` `.content { overflow-y: auto }`), *not* DocView's own div — App attaches the scroll listener to `.content` via a ref.
- **`src/main/projectService.ts`** has module-level `active: ActiveProject | null`, `inFlight` map, `BuildDeps = { spawnFn? }`, `noProgress`, `selectLocal(project)`, `loadGithubRef`, `selectProject(id)` (sets `active = null` then branches local/github), `rebuildProject`, `setDocsSubpath`, the `active?.id === id` guard pattern (in `rebuildProject`). E2 adds an injectable watcher lifecycle + an `index:changed` sink here.
- **`src/main/index.ts`** builds the single `BrowserWindow` in `createWindow()` and already uses `win.webContents` (for `setWindowOpenHandler`). E2 captures that `webContents` into the projectService sink and clears it on `'closed'`.
- **`src/main/ipc.ts`** streams `build:progress` via `progressTo(e)` (`e.sender.send`, guarded by `e.sender.isDestroyed()`). E2's `index:changed` does **not** ride an invoke event (a watcher fire has no `e`) — it is pushed from `index.ts` through the captured `webContents`, so the push channel does not touch ipc.ts. ipc.ts **is** modified once by E2 (MF3): the `projects:remove` handler calls `releaseIfActive(id)` so deleting the active local project tears down its watcher before/after `removeProject`.
- **`src/preload/index.ts`** exposes `onBuildProgress(cb)` (returns an unsubscribe). E2 mirrors it as `onIndexChanged(cb)`.
- **`src/shared/types.ts`** is the single source of truth for shared types; `ThemeChoice`/`THEME_CHOICES` already live here. E2 adds an `IndexChanged` payload + `IpcApi.onIndexChanged`.
- **`src/renderer/src/lib/theme.ts`** is the persistence precedent E3's `lib/session.ts` mirrors verbatim (localStorage, try/catch fail-soft, typed validator). It uses the bare `localStorage` global.
- **`src/renderer/src/components/BranchSwitcher.tsx`** renders a `<select data-role="ref-select">` inline in the status bar (passed into `StatusBar` via App's `branchSwitcher` prop). E4's "Switch ref…" command **focuses** this select (it does not switch refs itself) via a new `focusNonce` prop.
- **`src/renderer/src/components/TopBar.tsx`** / **`StatusBar.tsx`** / **`Settings.tsx`** each carry their own Escape/outside-click handlers. E4's palette Escape calls `stopPropagation()` (topmost-surface-only) and ⌘K is **suppressed when a modal is open** (`addOpen || settingsOpen`).
- **Renderer test harness (critical):** tests run under `bun test` with `tests/setup-dom.ts` (jsdom) preloaded via `bunfig.toml`. Component tests must (1) render via `react-dom/client` `createRoot` + `act` + `React.createElement` (never call the component as a function), (2) dispatch DOM events with `new window.Event(...)` / `new window.KeyboardEvent(...)`, (3) set controlled-input values via the prototype `value` setter then dispatch an `input` event, and (4) be listed in `tsconfig.web.json` `"include"` and `tsconfig.node.json` `"exclude"`. See `tests/addProjectModal.test.ts` / `tests/appDeleteActive.test.ts`. **`setup-dom.ts` does not register `CSS` or `localStorage` as globals** — E3 Task 1 adds `'CSS'` to the registration list (jsdom provides `window.CSS.escape`, which DocView's restore uses) and the session/restore/palette/indexChanged tests install a deterministic in-memory `localStorage` stub via the shared `tests/helpers/localStorage.ts` `stubLocalStorage()` helper in `beforeEach` and **restore the original property descriptor in `afterEach`** (so a stub never leaks across files/tests).
- **Commands:** `bun test <file>`, `bun run typecheck` (runs `typecheck:node` then `typecheck:web`), `bunx electron-vite build`. Run `bun test <file>` per task (don't background a full-suite run mid-task).

---

## File Structure

```
CREATED
  src/renderer/src/lib/session.ts            # localStorage session (load/save/validate) + pure pickAnchor
  src/renderer/src/components/CommandPalette.tsx   # ⌘K palette: tiers, fuzzy rank, keyboard/a11y
  src/renderer/src/lib/fuzzy.ts              # hand-rolled prefix-favoring subsequence scorer (single score)
  src/main/watcher.ts                        # fs.watch (injectable) + 300ms trailing/leading-suppressed debounce; Linux degrade
  tests/helpers/localStorage.ts              # shared stubLocalStorage() — descriptor save/restore (web tsconfig)
  tests/session.test.ts                      # E3 unit: load/save/validate + pickAnchor (web tsconfig)
  tests/sessionRestore.test.ts               # E3 App-level restore guards (web tsconfig)
  tests/fuzzy.test.ts                        # E4 scorer unit (web tsconfig)
  tests/commandPalette.test.ts               # E4 component (web tsconfig)
  tests/appPalette.test.ts                   # E4 App-level ⌘K keybinding (web tsconfig)
  tests/watch.test.ts                        # E2 backend: debounce/linux + lifecycle/active-id/github-never-watched (node)
  tests/indexChanged.test.ts                 # E2 renderer: tree update + preserve/remove notice (web tsconfig)

MODIFIED
  tests/setup-dom.ts                         # register 'CSS' global (jsdom CSS.escape) — E3
  src/renderer/src/components/DocView.tsx    # restoreHeadingId parallel restore (E3) + reloadNonce refetch (E2)
  src/renderer/src/App.tsx                   # E3 capture/restore; E4 paletteOpen + ⌘K + <CommandPalette>; E2 onIndexChanged subscribe + remove notice
  src/renderer/src/styles.css                # .palette-* (E4); .empty-state[data-removed] note already covered by .empty-state
  src/renderer/src/components/BranchSwitcher.tsx  # focusNonce prop → focus ref <select> (E4)
  src/shared/types.ts                        # IndexChanged payload + IpcApi.onIndexChanged (E2)
  src/preload/index.ts                       # onIndexChanged bridge (E2)
  src/main/index.ts                          # capture webContents → setIndexSink; stopWatch + clear sink on 'closed' (E2)
  src/main/projectService.ts                 # setIndexSink + watcher lifecycle + generation-gated reindex + stopWatch/releaseIfActive (E2)
  src/main/ipc.ts                            # projects:remove calls releaseIfActive(id) (E2 / MF3)
  tsconfig.web.json                          # include new renderer test files + tests/helpers/localStorage.ts
  tsconfig.node.json                         # exclude new renderer test files + tests/helpers/localStorage.ts
```

---

# Slice E3 — Session memory (PR 1)

*Renderer-only. No IPC, no main changes. Ships independently. Each task commits on its own; the slice is one PR.*

## Task E3.1 — `lib/session.ts` + the `CSS` test global

**Files:**
- Create: `src/renderer/src/lib/session.ts`
- Create: `tests/helpers/localStorage.ts`
- Create: `tests/session.test.ts`
- Modify: `tests/setup-dom.ts`
- Modify: `tsconfig.web.json`, `tsconfig.node.json`

- [ ] **Step 1: Register the new renderer test file + the shared test helper with the TypeScript projects.**

  In `tsconfig.web.json`, append `"tests/session.test.ts"` and `"tests/helpers/localStorage.ts"` to `"include"`. In `tsconfig.node.json`, append `"tests/session.test.ts"` and `"tests/helpers/localStorage.ts"` to `"exclude"`. (The helper references the DOM `Storage` type, which the node project's `lib` excludes — it is web-only, like the renderer test files.)

- [ ] **Step 1b: Create the shared localStorage stub helper** `tests/helpers/localStorage.ts`. It installs a deterministic in-memory `localStorage` and returns a teardown that restores the **original property descriptor** (or deletes it if none existed) — every test that uses it MUST call the teardown in `afterEach` so a stub never leaks across files/tests (D4-15):

```ts
// Shared deterministic localStorage stub for renderer tests. setup-dom.ts does NOT
// register a localStorage global; session.ts/theme.ts use the bare global. A test calls
// stubLocalStorage() (optionally seeding 'curator.session') and MUST invoke the returned
// teardown in afterEach to restore the original global.
export function stubLocalStorage(seed?: unknown): () => void {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const store = new Map<string, string>()
  if (seed !== undefined) store.set('curator.session', JSON.stringify(seed))
  const stub = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: () => null,
    get length() { return store.size }
  } as unknown as Storage
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true })
  return () => {
    if (prior) Object.defineProperty(globalThis, 'localStorage', prior)
    else delete (globalThis as { localStorage?: unknown }).localStorage
  }
}
```

- [ ] **Step 2: Add the `CSS` global to the jsdom test harness.** In `tests/setup-dom.ts`, add `'CSS'` to the registration array (jsdom provides `window.CSS.escape`, which DocView's restore path calls; without it the App-level tests that render DocView throw `ReferenceError: CSS is not defined`). Change the array so it includes `'CSS'`:

```ts
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
  'cancelAnimationFrame',
  'CSS'
]) {
  if (key in win) g[key] = win[key]
}
```

- [ ] **Step 3: Write the failing test** `tests/session.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { loadSession, saveSession, pickAnchor, type SessionState } from '../src/renderer/src/lib/session'
import { stubLocalStorage } from './helpers/localStorage'

// Deterministic in-memory localStorage (setup-dom.ts does not register one); the
// afterEach teardown restores the original global so the stub never leaks.
let restoreLs: () => void
beforeEach(() => { restoreLs = stubLocalStorage() })
afterEach(() => { restoreLs() })

describe('session load/save', () => {
  it('returns an empty state when nothing is stored', () => {
    expect(loadSession()).toEqual({ perProject: {} })
  })

  it('returns an empty state for malformed JSON', () => {
    localStorage.setItem('curator.session', '{ not json')
    expect(loadSession()).toEqual({ perProject: {} })
  })

  it('round-trips lastProjectId and per-project anchors', () => {
    const s: SessionState = { lastProjectId: 'p1', perProject: { p1: { docPath: 'a.md', headingId: 'intro' } } }
    saveSession(s)
    expect(loadSession()).toEqual(s)
  })

  it('drops malformed per-project entries but keeps valid ones', () => {
    localStorage.setItem('curator.session', JSON.stringify({
      lastProjectId: 7, // wrong type → dropped to undefined
      perProject: {
        good: { docPath: 'a.md' },
        noPath: { headingId: 'x' },           // missing docPath → dropped
        badHeading: { docPath: 'b.md', headingId: 9 } // wrong type heading → dropped
      }
    }))
    const out = loadSession()
    expect(out.lastProjectId).toBeUndefined()
    expect(out.perProject).toEqual({ good: { docPath: 'a.md', headingId: undefined } })
  })
})

describe('pickAnchor', () => {
  const headings = [
    { id: 'one', top: 0 },
    { id: 'two', top: 100 },
    { id: 'three', top: 200 }
  ]
  it('picks the nearest heading at or above the scroll top', () => {
    expect(pickAnchor(headings, 150)).toBe('two')
    expect(pickAnchor(headings, 200)).toBe('three')
  })
  it('returns undefined when scrolled above the first heading', () => {
    expect(pickAnchor([{ id: 'one', top: 50 }], 0)).toBeUndefined()
  })
  it('ignores headings without an id', () => {
    expect(pickAnchor([{ id: '', top: 0 }, { id: 'real', top: 10 }], 20)).toBe('real')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails.**

  Run: `bun test tests/session.test.ts`
  Expected: FAIL (`src/renderer/src/lib/session.ts` does not exist).

- [ ] **Step 5: Implement** `src/renderer/src/lib/session.ts`:

```ts
// Per-project "where was I" memory: the last open project, and per project the last
// open doc + a best-effort nearest-heading scroll anchor. Mirrors lib/theme.ts:
// localStorage, try/catch fail-soft, a validator that drops anything malformed.
// (D4-4: renderer localStorage, not a main-side settings file — see spec E3 Future.)

export interface DocAnchor {
  docPath: string
  headingId?: string // nearest heading at/above the scroll-container top; absent = top
}

export interface SessionState {
  lastProjectId?: string
  perProject: Record<string, DocAnchor> // keyed by project id
}

const STORAGE_KEY = 'curator.session'

function isAnchor(v: unknown): v is DocAnchor {
  if (typeof v !== 'object' || v === null) return false
  const a = v as Record<string, unknown>
  if (typeof a.docPath !== 'string' || a.docPath === '') return false
  if (a.headingId !== undefined && typeof a.headingId !== 'string') return false
  return true
}

export function loadSession(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { perProject: {} }
    const parsed = JSON.parse(raw) as Partial<SessionState>
    const perProject: Record<string, DocAnchor> = {}
    const src = parsed?.perProject
    if (src && typeof src === 'object') {
      for (const [id, anchor] of Object.entries(src)) {
        if (isAnchor(anchor)) perProject[id] = { docPath: anchor.docPath, headingId: anchor.headingId }
      }
    }
    const lastProjectId = typeof parsed?.lastProjectId === 'string' ? parsed.lastProjectId : undefined
    return { lastProjectId, perProject }
  } catch {
    return { perProject: {} }
  }
}

export function saveSession(state: SessionState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota/availability — session memory is non-critical state */
  }
}

// Pure: given heading offsets (id + offsetTop within the scroll content, in DOM order)
// and the current scrollTop, return the id of the nearest heading at/above the viewport
// top. Returns undefined when no heading is above the fold (doc is at the top). Input
// is assumed sorted ascending by `top` (DOM order of headings already is).
export function pickAnchor(headings: { id: string; top: number }[], scrollTop: number): string | undefined {
  let best: string | undefined
  for (const h of headings) {
    if (!h.id) continue
    if (h.top <= scrollTop + 1) best = h.id
    else break
  }
  return best
}
```

- [ ] **Step 6: Run the test to verify it passes.**

  Run: `bun test tests/session.test.ts`
  Expected: PASS.

- [ ] **Step 7: Typecheck.**

  Run: `bun run typecheck`
  Expected: PASS (both node + web projects).

- [ ] **Step 8: Commit.**

```bash
git add src/renderer/src/lib/session.ts tests/helpers/localStorage.ts tests/session.test.ts tests/setup-dom.ts tsconfig.web.json tsconfig.node.json
git commit -m "feat(session): localStorage session store + pure nearest-heading anchor"
```

## Task E3.2 — DocView parallel `restoreHeadingId` path

**Files:**
- Modify: `src/renderer/src/components/DocView.tsx`

> This task has no isolated unit test — DocView's render path (markdown sanitize + `enhanceDiagrams`) is exercised end-to-end by Task E3.3's App-level restore test. The change is a small, additive prop consumed inside the existing post-enhance `.then`; the typecheck + the E3.3 happy-path assertion are its verification.

- [ ] **Step 1: Add the `restoreHeadingId` prop and a parallel restore inside the post-enhance continuation.** Edit `src/renderer/src/components/DocView.tsx`. Add `restoreHeadingId` to `Props`:

```ts
interface Props {
  projectId: string
  docPath: string
  scrollToId: string | null
  scrollNonce: number
  restoreHeadingId?: string | null
  onToc?: (toc: TocEntry[]) => void
  onStats?: (stats: DocStats | null) => void
}
```

  Destructure it and keep it in a ref (so the `[html, kind]` render effect reads the latest value without adding it to deps — mirrors the existing `targetRef` pattern). Add below the `targetRef` lines:

```ts
  const restoreRef = useRef<string | null>(restoreHeadingId ?? null)
  restoreRef.current = restoreHeadingId ?? null
```

  In the render effect, replace the post-enhance `.then` so restore is a **parallel** path that only runs when there is **no** active jump target (a Contents/search jump always wins):

```ts
    void enhanceDiagrams(container).then(() => {
      onStats?.(computeDocStats(container))
      if (targetRef.current) {
        doScroll()
      } else if (restoreRef.current) {
        // Parallel session/live-reload restore (E3/E2): best-effort, silent. If the
        // saved heading no longer exists, querySelector returns null and we leave the
        // doc at the top. Does NOT reuse scrollToId/scrollNonce.
        const el = container.querySelector(`#${CSS.escape(restoreRef.current)}`)
        el?.scrollIntoView({ block: 'start' })
      }
    })
```

  (Update the destructuring in the function signature to include `restoreHeadingId`.)

- [ ] **Step 2: Typecheck.**

  Run: `bun run typecheck`
  Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add src/renderer/src/components/DocView.tsx
git commit -m "feat(docview): parallel restoreHeadingId scroll path (post-enhance)"
```

## Task E3.3 — App capture + restore-on-launch (4-case guard)

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Create: `tests/sessionRestore.test.ts`
- Modify: `tsconfig.web.json`, `tsconfig.node.json`

- [ ] **Step 1: Register the new test file.** In `tsconfig.web.json`, append `"tests/sessionRestore.test.ts"` to `"include"`; in `tsconfig.node.json`, append it to `"exclude"`.

- [ ] **Step 2: Write the failing test** `tests/sessionRestore.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import type { Project, NavNode } from '../src/shared/types'
import { stubLocalStorage as installLocalStorage } from './helpers/localStorage'

let container: HTMLDivElement
let root: Root

const A: Project = { id: 'a', name: 'Alpha', type: 'local', source: '/tmp/a', addedAt: 'now', status: 'ok', docCount: 1 }
const tree: NavNode[] = [{ type: 'doc', name: 'r.md', title: 'R', path: 'r.md', kind: 'md' }]

// Seed via the shared helper and track the teardown so afterEach restores the original
// localStorage descriptor (D4-15). Call sites keep using stubLocalStorage(seed) below.
let restoreLs: () => void = () => {}
function stubLocalStorage(seed?: unknown): void { restoreLs(); restoreLs = installLocalStorage(seed) }
afterEach(() => { restoreLs(); restoreLs = () => {} })

function stubApi(projects: Project[], over: Partial<Window['api']> = {}): void {
  ;(window as unknown as { api: Partial<Window['api']> }).api = {
    listProjects: async () => projects,
    selectProject: async () => ({ tree, docCount: 1 }),
    getDoc: async () => ({ kind: 'md', content: '# R\n\n## Setup\n\nbody' }),
    onBuildProgress: () => () => {},
    onIndexChanged: () => () => {},
    ...over
  }
}

beforeEach(() => {
  if (!window.matchMedia) {
    ;(window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: false, addEventListener: () => {}, removeEventListener: () => {}
    })
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

async function mount(): Promise<void> {
  await act(async () => { root.render(createElement(App)) })
  await act(async () => {}) // flush the async launch effect
  await act(async () => {})
}

describe('App session restore', () => {
  it('happy path: restores the project and its doc, scrolled to the saved anchor', async () => {
    stubLocalStorage({ lastProjectId: 'a', perProject: { a: { docPath: 'r.md', headingId: 'setup' } } })
    stubApi([A])
    await mount()
    expect(container.querySelector('.sidebar')).toBeTruthy()
    expect(container.querySelector('.tree-item.active')).toBeTruthy()
    expect(container.textContent).not.toContain('Select a document.')
  })

  it('project missing/unavailable: falls back to the home empty-state', async () => {
    stubLocalStorage({ lastProjectId: 'gone', perProject: {} })
    stubApi([A])
    await mount()
    expect(container.querySelector('.sidebar')).toBeNull()
    expect(container.textContent).toContain('Add or select a project to begin.')
  })

  it('doc no longer in tree: selects the project but shows "Select a document."', async () => {
    stubLocalStorage({ lastProjectId: 'a', perProject: { a: { docPath: 'gone.md' } } })
    stubApi([A])
    await mount()
    expect(container.querySelector('.sidebar')).toBeTruthy()
    expect(container.textContent).toContain('Select a document.')
  })

  it('first run (no session): home empty-state, nothing restored', async () => {
    stubLocalStorage(undefined)
    stubApi([A])
    await mount()
    expect(container.querySelector('.sidebar')).toBeNull()
    expect(container.textContent).toContain('Add or select a project to begin.')
  })

  it('best-effort anchor: a missing heading id still opens the doc without throwing', async () => {
    stubLocalStorage({ lastProjectId: 'a', perProject: { a: { docPath: 'r.md', headingId: 'nope' } } })
    stubApi([A])
    await mount()
    expect(container.querySelector('.tree-item.active')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails.**

  Run: `bun test tests/sessionRestore.test.ts`
  Expected: FAIL (App has no restore loop yet — happy-path/doc-not-in-tree assertions fail).

- [ ] **Step 4: Implement the App wiring.** Edit `src/renderer/src/App.tsx`.

  Add `useRef` to the React import and import the session lib + `pickAnchor`:

```tsx
import { useEffect, useState, useCallback, useRef } from 'react'
```

```tsx
import { loadSession, saveSession, pickAnchor, type SessionState } from './lib/session'
```

  Add state + a session mirror ref, near the other `useState`s:

```tsx
  const [restoreHeadingId, setRestoreHeadingId] = useState<string | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  // Lazy initializer: read localStorage exactly once. (A bare `useRef(loadSession())`
  // evaluates loadSession() — and re-reads localStorage — on EVERY render; `useState`
  // with a function initializer runs it only on the first render.) The ref mirrors the
  // loaded object so the capture/restore code can mutate it in place.
  const [initialSession] = useState<SessionState>(loadSession)
  const sessionRef = useRef<SessionState>(initialSession)
  const didRunRef = useRef(false) // StrictMode dev double-invoke latch (MF5)
```

  **Replace** the mount effect `useEffect(() => { void refreshProjects() }, [refreshProjects])` with a combined load-then-restore launch effect (this avoids the empty-first-render race — restore must see the loaded project list, not the initial `[]`):

```tsx
  // Launch: load projects, then attempt session restore (guarded fail-soft to home).
  useEffect(() => {
    if (didRunRef.current) return // React.StrictMode double-invokes effects in dev — run the restore exactly once
    didRunRef.current = true
    void (async () => {
      const list = await window.api.listProjects()
      setProjects(list)

      const s = sessionRef.current
      const pid = s.lastProjectId
      if (!pid) return // first run / no last project → home empty-state
      const proj = list.find((p) => p.id === pid)
      if (!proj || proj.status === 'unavailable') return // missing/unavailable → home

      setActiveId(pid)
      setDocPath(null)
      resetDocState()
      const { tree: t } = await window.api.selectProject(pid) // build stale/in-progress resolves here
      setTree(t)

      const anchor = s.perProject[pid]
      if (anchor && treeHasPath(t, anchor.docPath)) {
        setRestoreHeadingId(anchor.headingId ?? null)
        setScrollToId(null)
        setDocPath(anchor.docPath)
        resetDocState()
      }
      // else: leave the project at its "Select a document." content state (no error).
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

  Add the **save-through** of `lastProjectId` inside the existing `selectProject` callback (after `setActiveId(id)`):

```tsx
    sessionRef.current.lastProjectId = id
    saveSession(sessionRef.current)
```

  Add the doc save-through inside the existing `openDoc` callback (so reopening later restores there). Replace the `openDoc` body with:

```tsx
  const openDoc = useCallback((path: string) => {
    setDocPath(path)
    resetDocState()
    setScrollToId(null)
    setRestoreHeadingId(null) // a fresh manual open starts at the top
    if (activeId) {
      sessionRef.current.lastProjectId = activeId
      sessionRef.current.perProject[activeId] = { docPath: path, headingId: undefined }
      saveSession(sessionRef.current)
    }
  }, [resetDocState, activeId])
```

  Add a throttled (~250 ms trailing) scroll listener on the `.content` container. Add this effect after the other effects:

```tsx
  // Persist a best-effort nearest-heading anchor as the user scrolls (~250ms trailing).
  useEffect(() => {
    const el = mainRef.current
    if (!el || !activeId || !docPath) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const onScroll = (): void => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        const headings = Array.from(el.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id]'))
          .map((h) => ({ id: h.id, top: h.offsetTop }))
        const headingId = pickAnchor(headings, el.scrollTop)
        sessionRef.current.lastProjectId = activeId
        sessionRef.current.perProject[activeId] = { docPath, headingId }
        saveSession(sessionRef.current)
      }, 250)
    }
    el.addEventListener('scroll', onScroll)
    return () => { el.removeEventListener('scroll', onScroll); if (timer) clearTimeout(timer) }
  }, [activeId, docPath])
```

  Attach the ref to the content `<main>` and pass `restoreHeadingId` to DocView. Change the `<main className="content" ...>` opening tag and the `<DocView .../>` usage:

```tsx
        <main className="content" data-theme={docTheme} ref={mainRef}>
```

```tsx
            ) : activeId && docPath ? (
              <DocView
                projectId={activeId}
                docPath={docPath}
                scrollToId={scrollToId}
                scrollNonce={scrollNonce}
                restoreHeadingId={restoreHeadingId}
                onToc={setToc}
                onStats={setStats}
              />
```

- [ ] **Step 5: Run the test to verify it passes.**

  Run: `bun test tests/sessionRestore.test.ts`
  Expected: PASS.

- [ ] **Step 6: Typecheck and full E3 test sweep.**

  Run: `bun run typecheck` — Expected: PASS.
  Run: `bun test tests/session.test.ts tests/sessionRestore.test.ts` — Expected: PASS.

- [ ] **Step 7: Manual smoke (document in commit body; not automated).** `bun run dev` → open a project + doc, scroll partway, quit, relaunch → it reopens that project + doc near where you were. Delete the last project from disk / mark unavailable → relaunch lands on the home empty-state with no error.

- [ ] **Step 8: Commit.**

```bash
git add src/renderer/src/App.tsx tests/sessionRestore.test.ts tsconfig.web.json tsconfig.node.json
git commit -m "feat(session): App capture + restore-on-launch with 4-case fail-soft guard"
```

---

# Slice E4 — Command palette (PR 2)

*Renderer-only. No IPC, no main changes. Ships independently. Depends on nothing from E3.*

## Task E4.1 — `lib/fuzzy.ts` rank-only scorer

**Files:**
- Create: `src/renderer/src/lib/fuzzy.ts`
- Create: `tests/fuzzy.test.ts`
- Modify: `tsconfig.web.json`, `tsconfig.node.json`

- [ ] **Step 1: Register the test file.** In `tsconfig.web.json`, append `"tests/fuzzy.test.ts"` to `"include"`; in `tsconfig.node.json`, append it to `"exclude"`. (It imports a renderer-path module, so it belongs to the web project.)

- [ ] **Step 2: Write the failing test** `tests/fuzzy.test.ts`:

```ts
import { describe, it, expect } from 'bun:test'
import { score } from '../src/renderer/src/lib/fuzzy'

describe('fuzzy score', () => {
  it('returns 0 for a non-subsequence and for an empty query', () => {
    expect(score('xyz', 'ab')).toBe(0)
    expect(score('', 'anything')).toBe(0)
  })

  it('ranks a prefix match above the same query buried mid-string', () => {
    expect(score('arch', 'Architecture')).toBeGreaterThan(score('arch', 'search'))
  })

  it('ranks a contiguous match above a scattered subsequence', () => {
    expect(score('ab', 'ab')).toBeGreaterThan(score('ab', 'a-x-b'))
  })

  it('ranks an exact match highest among its peers', () => {
    expect(score('ipc', 'ipc')).toBeGreaterThan(score('ipc', 'ipc channels'))
    expect(score('ipc', 'ipc channels')).toBeGreaterThan(score('ipc', 'principal'))
  })

  it('rewards word-boundary (initialism) matches', () => {
    // "ar" hits the start of "api" and "reference" → boundary bonus beats a mid-word hit.
    expect(score('ar', 'api-reference')).toBeGreaterThan(score('ar', 'cellar'))
  })
})
```

- [ ] **Step 3: Run the test to verify it fails.**

  Run: `bun test tests/fuzzy.test.ts`
  Expected: FAIL (`src/renderer/src/lib/fuzzy.ts` does not exist).

- [ ] **Step 4: Implement** `src/renderer/src/lib/fuzzy.ts`:

```ts
// Hand-rolled fuzzy scorer (no dependency — cannot npm-install). Returns a single
// numeric score; 0 means "no subsequence match" (the caller drops it). The scorer
// FAVORS prefix and contiguous matches so a higher score is an obviously better match
// — v1 is rank-only (no <mark> character highlighting; that is a deferred fast-follow).
export function score(query: string, target: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const t = target.toLowerCase()
  if (!t) return 0

  let ti = 0 // next index in target we may match from
  let total = 0
  let streak = 0 // run length of contiguous matches
  let matched = 0
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]
    let found = -1
    for (let k = ti; k < t.length; k++) {
      if (t[k] === ch) { found = k; break }
    }
    if (found === -1) return 0 // not a subsequence → no match

    let pts = 1
    if (found === ti) { streak += 1; pts += streak * 2 } else { streak = 0 } // contiguity
    if (found === 0) pts += 5 // prefix of the whole target
    else if (/[\s/_.\-]/.test(t[found - 1])) pts += 3 // word-boundary (initialism)
    const gap = found - ti
    if (gap > 0) pts -= Math.min(gap, 3) // skipped chars penalty (clamped)
    total += pts
    matched += 1
    ti = found + 1
  }

  if (t.startsWith(q)) total += 10 // whole-prefix nudge
  if (t === q) total += 10 // exact match tops its peers
  total += Math.round((matched / t.length) * 5) // density: query covering more of a short target ranks up
  return Math.max(total, 1) // a real subsequence always scores ≥ 1
}
```

- [ ] **Step 5: Run the test to verify it passes.**

  Run: `bun test tests/fuzzy.test.ts`
  Expected: PASS.

- [ ] **Step 6: Typecheck.**

  Run: `bun run typecheck`
  Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/renderer/src/lib/fuzzy.ts tests/fuzzy.test.ts tsconfig.web.json tsconfig.node.json
git commit -m "feat(fuzzy): hand-rolled prefix-favoring subsequence scorer (rank-only)"
```

## Task E4.2 — `CommandPalette.tsx` component

**Files:**
- Create: `src/renderer/src/components/CommandPalette.tsx`
- Create: `tests/commandPalette.test.ts`
- Modify: `tsconfig.web.json`, `tsconfig.node.json`

- [ ] **Step 1: Register the test file.** In `tsconfig.web.json`, append `"tests/commandPalette.test.ts"` to `"include"`; in `tsconfig.node.json`, append it to `"exclude"`.

- [ ] **Step 2: Write the failing test** `tests/commandPalette.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import CommandPalette, { type CommandPaletteProps } from '../src/renderer/src/components/CommandPalette'
import type { Project, NavNode } from '../src/shared/types'

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

const local: Project = { id: 'l1', name: 'Curator', type: 'local', source: '/c', addedAt: 'now', status: 'ok', docCount: 2 }
const gh: Project = { id: 'g1', name: 'design-system', type: 'github', source: 'https://github.com/o/r', refs: [{ ref: 'main', lastBuiltAt: 'now', docCount: 1 }], currentRef: 'main', addedAt: 'now', status: 'ok' }
const tree: NavNode[] = [
  { type: 'doc', name: 'architecture.md', title: 'Architecture overview', path: 'docs/architecture.md', kind: 'md' },
  { type: 'doc', name: 'ipc.md', title: 'IPC channels', path: 'docs/ipc.md', kind: 'md' }
]

function setValue(el: HTMLInputElement, v: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(el, v)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

function props(over: Partial<CommandPaletteProps> = {}): CommandPaletteProps {
  return {
    projects: [local, gh], activeId: 'l1', activeProject: local, tree,
    onSelectProject: () => {}, onOpenDoc: () => {}, onSwitchRef: () => {},
    onAddProject: () => {}, onManageProjects: () => {}, onRebuild: () => {},
    onSettings: () => {}, onClose: () => {},
    ...over
  }
}
async function render(p: CommandPaletteProps): Promise<void> {
  await act(async () => { root.render(createElement(CommandPalette, p)) })
}
const input = (): HTMLInputElement => container.querySelector('[data-field="palette-search"]') as HTMLInputElement
const optKinds = (): string[] => Array.from(container.querySelectorAll('[data-option]')).map((o) => o.getAttribute('data-kind') as string)

describe('CommandPalette', () => {
  it('empty query lists Projects + Commands only (no Documents) and the hint', async () => {
    await render(props())
    expect(optKinds()).not.toContain('doc')
    expect(optKinds()).toContain('project')
    expect(optKinds()).toContain('command')
    expect(container.querySelector('[data-hint]')?.textContent).toBe('Type to search documents…')
  })

  it('typing surfaces the Documents tier and narrows to a unique doc', async () => {
    await render(props())
    await act(async () => { setValue(input(), 'ipc') })
    const docs = Array.from(container.querySelectorAll('[data-option][data-kind="doc"]'))
    expect(docs.length).toBe(1)
    expect(docs[0].textContent).toContain('IPC channels')
    expect(container.querySelector('[data-hint]')).toBeNull()
  })

  it('shows the No matches. row for a non-matching query', async () => {
    await render(props())
    await act(async () => { setValue(input(), 'zzzqqq') })
    expect(container.querySelector('[data-empty]')?.textContent).toBe('No matches.')
  })

  it('activates a doc with Enter (after typing) and closes', async () => {
    let opened = ''
    let closed = false
    await render(props({ onOpenDoc: (p) => { opened = p }, onClose: () => { closed = true } }))
    await act(async () => { setValue(input(), 'architecture') })
    await act(async () => { input().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(opened).toBe('docs/architecture.md')
    expect(closed).toBe(true)
  })

  it('selects a project on click and closes', async () => {
    let picked = ''
    let closed = false
    await render(props({ onSelectProject: (id) => { picked = id }, onClose: () => { closed = true } }))
    const projOpt = container.querySelector('[data-option][data-kind="project"]') as HTMLElement
    await act(async () => { projOpt.click() })
    expect(picked).toBe('l1')
    expect(closed).toBe(true)
  })

  it('hides Documents/Reindex/Switch-ref commands when no project is active', async () => {
    await render(props({ activeId: null, activeProject: null }))
    const labels = Array.from(container.querySelectorAll('[data-option][data-kind="command"]')).map((o) => o.textContent)
    expect(labels.some((l) => l?.includes('Add project'))).toBe(true)
    expect(labels.some((l) => l?.includes('Reindex') || l?.includes('Pull latest'))).toBe(false)
    expect(labels.some((l) => l?.includes('Switch ref'))).toBe(false)
    expect(container.querySelector('[data-hint]')).toBeNull() // no active project → no docs hint either
  })

  it('shows Switch ref… for a github active project and fires onSwitchRef + close', async () => {
    let switched = false
    let closed = false
    await render(props({ activeId: 'g1', activeProject: gh, onSwitchRef: () => { switched = true }, onClose: () => { closed = true } }))
    const ref = Array.from(container.querySelectorAll('[data-option][data-kind="command"]')).find((o) => o.textContent?.includes('Switch ref…')) as HTMLElement
    expect(ref).toBeTruthy()
    await act(async () => { ref.click() })
    expect(switched).toBe(true)
    expect(closed).toBe(true)
  })

  it('Escape closes the palette and stops propagation', async () => {
    let closed = false
    let leaked = false
    await render(props({ onClose: () => { closed = true } }))
    document.addEventListener('keydown', () => { leaked = true }, { once: true })
    await act(async () => { input().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(closed).toBe(true)
    expect(leaked).toBe(false) // stopPropagation → outer handler never sees it
  })

  it('caps the Documents tier at 50 and shows the overflow row', async () => {
    const many: NavNode[] = Array.from({ length: 60 }, (_, i) => ({
      type: 'doc', name: `doc${i}.md`, title: `doc ${i}`, path: `docs/doc${i}.md`, kind: 'md'
    }))
    await render(props({ tree: many }))
    await act(async () => { setValue(input(), 'doc') })
    expect(container.querySelectorAll('[data-option][data-kind="doc"]').length).toBe(50)
    expect(container.querySelector('[data-more]')?.textContent).toBe('…and 10 more — keep typing')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails.**

  Run: `bun test tests/commandPalette.test.ts`
  Expected: FAIL (`CommandPalette` does not exist).

- [ ] **Step 4: Implement** `src/renderer/src/components/CommandPalette.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project, NavNode } from '@shared/types'
import { score } from '../lib/fuzzy'

const DOC_CAP = 50

interface Cmd { id: string; label: string; icon: string; run: () => void }
type Row =
  | { kind: 'project'; id: string; label: string; chip: string; icon: string; run: () => void; score: number }
  | { kind: 'doc'; id: string; label: string; path: string; run: () => void; score: number }
  | { kind: 'command'; id: string; label: string; icon: string; run: () => void; score: number }

export interface CommandPaletteProps {
  projects: Project[]
  activeId: string | null
  activeProject: Project | null
  tree: NavNode[]
  onSelectProject: (id: string) => void
  onOpenDoc: (path: string) => void
  onSwitchRef: () => void // focuses the existing BranchSwitcher; does not switch refs
  onAddProject: () => void
  onManageProjects: () => void
  onRebuild: () => void
  onSettings: () => void
  onClose: () => void
}

function flattenDocs(nodes: NavNode[], out: { path: string; title: string }[] = []): { path: string; title: string }[] {
  for (const n of nodes) {
    if (n.type === 'doc') out.push({ path: n.path, title: n.title })
    else flattenDocs(n.children, out)
  }
  return out
}

export default function CommandPalette(props: CommandPaletteProps): React.JSX.Element {
  // Destructure the callbacks so the memos below depend on the specific functions, not
  // the whole `props` object (which is a fresh reference every App render and would bust
  // every memo each keystroke).
  const {
    projects, activeId, activeProject, tree,
    onSelectProject, onOpenDoc, onSwitchRef, onAddProject, onManageProjects, onRebuild, onSettings, onClose
  } = props
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const q = query.trim()

  useEffect(() => { inputRef.current?.focus() }, [])

  const docs = useMemo(() => flattenDocs(tree), [tree])

  const commands = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      { id: 'cmd:add', label: 'Add project', icon: 'fa-plus', run: onAddProject },
      { id: 'cmd:manage', label: 'Manage projects', icon: 'fa-list', run: onManageProjects }
    ]
    if (activeProject) {
      list.push({
        id: 'cmd:rebuild',
        label: activeProject.type === 'github' ? 'Pull latest' : 'Reindex',
        icon: 'fa-rotate',
        run: onRebuild
      })
    }
    if (activeProject?.type === 'github') {
      list.push({ id: 'cmd:ref', label: 'Switch ref…', icon: 'fa-code-branch', run: onSwitchRef })
    }
    list.push({ id: 'cmd:settings', label: 'Settings', icon: 'fa-gear', run: onSettings })
    return list
  }, [activeProject, onAddProject, onManageProjects, onRebuild, onSwitchRef, onSettings])

  const { projectRows, docRows, commandRows, docOverflow } = useMemo(() => {
    const rankKeep = (rows: Row[]): Row[] =>
      q ? rows.filter((r) => r.score > 0).sort((a, b) => b.score - a.score) : rows

    const proj: Row[] = projects.map((p) => ({
      kind: 'project', id: p.id, label: p.name, chip: p.type,
      icon: p.type === 'github' ? 'fa-github' : 'fa-folder',
      run: () => onSelectProject(p.id),
      score: q ? score(q, p.name) : 1
    }))
    const cmds: Row[] = commands.map((c) => ({
      kind: 'command', id: c.id, label: c.label, icon: c.icon, run: c.run,
      score: q ? score(q, c.label) : 1
    }))

    let docRowsOut: Row[] = []
    let overflow = 0
    if (q && activeId) {
      const scored: Row[] = docs
        .map((d) => ({
          kind: 'doc' as const, id: `doc:${d.path}`, label: d.title, path: d.path,
          run: () => onOpenDoc(d.path),
          score: Math.max(score(q, d.title), score(q, d.path))
        }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
      overflow = Math.max(0, scored.length - DOC_CAP)
      docRowsOut = scored.slice(0, DOC_CAP)
    }

    return { projectRows: rankKeep(proj), docRows: docRowsOut, commandRows: rankKeep(cmds), docOverflow: overflow }
  }, [projects, commands, docs, q, activeId, onSelectProject, onOpenDoc])

  // Flattened selectable rows for ↑/↓/Enter (Projects → Documents → Commands).
  const selectable = useMemo(() => [...projectRows, ...docRows, ...commandRows], [projectRows, docRows, commandRows])

  useEffect(() => { setActive(0) }, [query]) // reset highlight to top on every keystroke
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const activateAt = (i: number): void => {
    const row = selectable[i]
    if (!row) return
    row.run()
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (selectable.length ? (i + 1) % selectable.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (selectable.length ? (i - 1 + selectable.length) % selectable.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      activateAt(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation() // topmost-surface-only: nothing underneath also closes
      onClose()
    }
  }

  const noMatch = q !== '' && selectable.length === 0

  // `idx` walks the flattened selectable order so data-index matches `selectable`.
  let idx = -1
  const renderRow = (row: Row): React.JSX.Element => {
    idx += 1
    const i = idx
    const selected = i === active
    return (
      <div
        key={row.id}
        id={`palette-opt-${i}`}
        role="option"
        aria-selected={selected}
        data-option
        data-kind={row.kind}
        data-id={row.id}
        data-index={i}
        className={`palette-row${selected ? ' is-active' : ''}`}
        onMouseMove={() => setActive(i)}
        onClick={() => activateAt(i)}
      >
        <i className={`palette-icon fa-solid ${row.kind === 'doc' ? 'fa-file-lines' : row.icon}`} aria-hidden="true" />
        <span className="palette-label">{row.label}</span>
        {row.kind === 'doc' && <span className="palette-path">{row.path}</span>}
        {row.kind === 'project' && <span className="palette-chip" data-chip>{row.chip}</span>}
      </div>
    )
  }

  return (
    <div
      className="modal-overlay palette-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" data-palette>
        <input
          ref={inputRef}
          className="palette-input field"
          data-field="palette-search"
          type="text"
          placeholder="Search projects, docs, and commands…"
          value={query}
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={selectable.length ? `palette-opt-${active}` : undefined}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {noMatch ? (
            <div className="palette-empty" data-empty>No matches.</div>
          ) : (
            <>
              {projectRows.length > 0 && (
                <div className="palette-group" role="presentation" data-group="projects">Projects</div>
              )}
              {projectRows.map(renderRow)}

              {!q && activeId && <div className="palette-hint" data-hint>Type to search documents…</div>}
              {docRows.length > 0 && (
                <div className="palette-group" role="presentation" data-group="documents">
                  {`Documents · ${activeProject?.name ?? ''}`}
                </div>
              )}
              {docRows.map(renderRow)}
              {docOverflow > 0 && (
                <div className="palette-more" data-more>{`…and ${docOverflow} more — keep typing`}</div>
              )}

              {commandRows.length > 0 && (
                <div className="palette-group" role="presentation" data-group="commands">Commands</div>
              )}
              {commandRows.map(renderRow)}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes.**

  Run: `bun test tests/commandPalette.test.ts`
  Expected: PASS.

- [ ] **Step 6: Typecheck.**

  Run: `bun run typecheck`
  Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/renderer/src/components/CommandPalette.tsx tests/commandPalette.test.ts tsconfig.web.json tsconfig.node.json
git commit -m "feat(palette): CommandPalette — tiered rank-only results, keyboard + a11y"
```

## Task E4.3 — `.palette-*` styles

**Files:**
- Modify: `src/renderer/src/styles.css`

> CSS-only; verified by `bunx electron-vite build` + manual smoke (no unit test).

- [ ] **Step 1: Append the palette styles** to `src/renderer/src/styles.css`. These build on `.modal-overlay` + existing tokens and mirror the `.tree-item.active` highlight treatment:

```css
/* ── Command palette ────────────────────────────────────────────────────── */
.palette-overlay { align-items: flex-start; }
.palette {
  margin-top: 12vh; width: min(640px, 92vw); display: flex; flex-direction: column;
  background: var(--surface-raised); color: var(--fg); border: 1px solid var(--border);
  border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); overflow: hidden;
  animation: palette-in var(--transition-slow) var(--ease-out); }
@keyframes palette-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.palette-input {
  border: 0; border-bottom: 1px solid var(--border); border-radius: 0;
  background: var(--surface-raised); color: var(--fg); font-size: var(--text-base);
  padding: var(--space-4) var(--space-5); outline: none; }
.palette-input::placeholder { color: var(--faint); }
.palette-input:focus-visible { box-shadow: inset 0 0 0 2px var(--accent-ring); }
.palette-list { overflow-y: auto; max-height: min(56vh, 420px); padding: var(--space-1); }
.palette-group {
  position: sticky; top: 0; z-index: 1; background: var(--surface-raised);
  font-size: var(--text-label); font-weight: var(--weight-medium); text-transform: uppercase;
  letter-spacing: var(--tracking-label); color: var(--muted);
  padding: var(--space-2) var(--space-3) var(--space-1); }
.palette-hint, .palette-more, .palette-empty {
  color: var(--muted); font-size: var(--text-ui); padding: var(--space-2) var(--space-3); }
.palette-row {
  display: flex; align-items: center; gap: var(--space-2); min-height: 32px;
  padding: 0 var(--space-3); border-radius: var(--radius-sm); cursor: pointer;
  font-size: var(--text-ui); transition: background var(--transition), color var(--transition); }
.palette-row.is-active { background: var(--accent-soft); color: var(--accent); font-weight: var(--weight-semibold); }
.palette-icon { color: var(--muted); width: 14px; text-align: center; flex: 0 0 auto; }
.palette-row.is-active .palette-icon { color: var(--accent); }
.palette-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.palette-path {
  margin-left: auto; color: var(--muted); font-family: var(--font-mono); font-size: 12px;
  direction: rtl; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 45%; }
.palette-chip {
  margin-left: auto; font-size: 11px; color: var(--muted); background: var(--surface-alt);
  border-radius: var(--radius-sm); padding: 1px 6px; }
@media (prefers-reduced-motion: reduce) { .palette { animation: none; } }
```

- [ ] **Step 2: Build to verify the CSS compiles.**

  Run: `bunx electron-vite build`
  Expected: a clean build (renderer bundles, CSS compiles).

- [ ] **Step 3: Commit.**

```bash
git add src/renderer/src/styles.css
git commit -m "style(palette): .palette-* chrome on .modal-overlay + Cobalt tokens"
```

## Task E4.4 — App ⌘K keybinding + render palette + BranchSwitcher focus

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/BranchSwitcher.tsx`
- Create: `tests/appPalette.test.ts`
- Modify: `tsconfig.web.json`, `tsconfig.node.json`

- [ ] **Step 1: Register the test file.** In `tsconfig.web.json`, append `"tests/appPalette.test.ts"` to `"include"`; in `tsconfig.node.json`, append it to `"exclude"`.

- [ ] **Step 2: Write the failing test** `tests/appPalette.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import type { Project, NavNode } from '../src/shared/types'
import { stubLocalStorage } from './helpers/localStorage'

let container: HTMLDivElement
let root: Root
let restoreLs: () => void
const A: Project = { id: 'a', name: 'Alpha', type: 'local', source: '/tmp/a', addedAt: 'now', status: 'ok', docCount: 1 }
const docTree: NavNode[] = [{ type: 'doc', name: 'r.md', title: 'Readme', path: 'r.md', kind: 'md' }]

beforeEach(() => {
  if (!window.matchMedia) {
    ;(window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: false, addEventListener: () => {}, removeEventListener: () => {}
    })
  }
  restoreLs = stubLocalStorage()
  ;(window as unknown as { api: Partial<Window['api']> }).api = {
    listProjects: async () => [A],
    selectProject: async () => ({ tree: [], docCount: 0 }),
    getDoc: async () => ({ kind: 'md', content: '# Readme' }),
    onBuildProgress: () => () => {},
    onIndexChanged: () => () => {}
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => { restoreLs() })

async function mount(): Promise<void> {
  await act(async () => { root.render(createElement(App)) })
  await act(async () => {})
}
const palette = (): Element | null => container.querySelector('[data-palette]')
function key(k: string, init: Partial<KeyboardEventInit> = {}): void {
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, ...init }))
}
const search = (): HTMLInputElement => container.querySelector('[data-field="palette-search"]') as HTMLInputElement
function setValue(el: HTMLInputElement, v: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(el, v)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

describe('App command palette keybinding', () => {
  it('opens on Ctrl+K and toggles closed on a second Ctrl+K', async () => {
    await mount()
    expect(palette()).toBeNull()
    await act(async () => { key('k', { ctrlKey: true }) })
    expect(palette()).toBeTruthy()
    await act(async () => { key('k', { ctrlKey: true }) })
    expect(palette()).toBeNull()
  })

  it('opens on Meta+K and closes on Escape', async () => {
    await mount()
    await act(async () => { key('k', { metaKey: true }) })
    expect(palette()).toBeTruthy()
    await act(async () => {
      (container.querySelector('[data-field="palette-search"]') as HTMLInputElement)
        .dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(palette()).toBeNull()
  })

  it('is suppressed while a modal (Settings) is open', async () => {
    await mount()
    await act(async () => { (container.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click() })
    await act(async () => { key('k', { ctrlKey: true }) })
    expect(palette()).toBeNull()
  })

  it('activating a Document result while in the Manage view switches back to the docs view (MF4)', async () => {
    // Give selectProject a real tree so the Documents tier has something to match.
    ;(window as unknown as { api: Partial<Window['api']> }).api.selectProject = async () => ({ tree: docTree, docCount: 1 })
    await mount()
    // Select the project (docs view, active), then jump to the Manage view via the palette.
    const projectSelect = container.querySelector('.topbar-select') as HTMLSelectElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
      setter.call(projectSelect, 'a')
      projectSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
    })
    await act(async () => {})
    await act(async () => { key('k', { metaKey: true }) })
    const manageCmd = Array.from(container.querySelectorAll('[data-option][data-kind="command"]'))
      .find((o) => o.textContent?.includes('Manage projects')) as HTMLElement
    await act(async () => { manageCmd.click() })
    expect(container.querySelector('.sidebar')).toBeNull() // Manage view: sidebar is not rendered

    // Reopen the palette, find the doc, and activate it — the view must flip to docs.
    await act(async () => { key('k', { metaKey: true }) })
    await act(async () => { setValue(search(), 'readme') })
    await act(async () => {
      search().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await act(async () => {})
    expect(container.querySelector('.sidebar')).toBeTruthy() // back in the docs view
  })
})
```

- [ ] **Step 3: Run the test to verify it fails.**

  Run: `bun test tests/appPalette.test.ts`
  Expected: FAIL (no palette state/keybinding yet).

- [ ] **Step 4: Add the `focusNonce` prop to BranchSwitcher.** Edit `src/renderer/src/components/BranchSwitcher.tsx`. Add `useEffect, useRef` to the import and `focusNonce?: number` to `Props`:

```ts
import { useEffect, useRef, useState } from 'react'
```

```ts
interface Props {
  refs: RefInfo[]
  currentRef: string
  onSwitch: (ref: string) => void
  onAddRef: (ref: string) => void
  onRemoveRef: (ref: string) => void
  focusNonce?: number
}
```

  Add a ref + an effect that focuses the select when the nonce bumps (skip the initial 0), and attach the ref to the `<select data-role="ref-select">`:

```ts
  const selectRef = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    if (props.focusNonce && props.focusNonce > 0) selectRef.current?.focus()
  }, [props.focusNonce])
```

```tsx
      <select
        ref={selectRef}
        data-role="ref-select"
        className="topbar-select"
        value={currentRef}
        aria-label="Branch"
        onChange={(e) => props.onSwitch(e.target.value)}
      >
```

- [ ] **Step 5: Wire the palette into App.** Edit `src/renderer/src/App.tsx`.

  Import the palette:

```tsx
import CommandPalette from './components/CommandPalette'
```

  Add state near the other `useState`s:

```tsx
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [refFocusNonce, setRefFocusNonce] = useState(0)
```

  Add the App-level ⌘K/Ctrl+K keydown effect (suppressed when a modal is open; fires even when an input is focused because it listens on `window`):

```tsx
  // First app-level key handler: ⌘K (mac) / Ctrl+K toggles the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        if (addOpen || settingsOpen) return // do not stack the palette over a modal
        e.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addOpen, settingsOpen])
```

  Render the palette (only when no modal is open). Add this just before the `{addOpen && ...}` line near the end of the returned JSX. **MF4:** opening a document or focusing the ref switcher from the palette must leave the **docs** view, so wrap `onOpenDoc` (and `onSwitchRef`) with `setView('docs')` — otherwise the palette can fire while `view === 'manage'` and the activated doc never becomes visible (the Manage view stays mounted). `onSelectProject` already calls `setView('docs')` inside the `selectProject` callback, so it needs no wrapper:

```tsx
      {paletteOpen && !addOpen && !settingsOpen && (
        <CommandPalette
          projects={projects}
          activeId={activeId}
          activeProject={activeProject}
          tree={tree}
          onSelectProject={selectProject}
          onOpenDoc={(path) => { setView('docs'); openDoc(path) }}
          onSwitchRef={() => { setView('docs'); setPaletteOpen(false); setRefFocusNonce((n) => n + 1) }}
          onAddProject={() => setAddOpen(true)}
          onManageProjects={() => setView('manage')}
          onRebuild={rebuild}
          onSettings={() => setSettingsOpen(true)}
          onClose={() => setPaletteOpen(false)}
        />
      )}
```

  Pass `focusNonce` to the `<BranchSwitcher>` usage (add the one prop):

```tsx
              <BranchSwitcher
                refs={activeProject.refs}
                currentRef={activeProject.currentRef}
                onSwitch={switchRef}
                onAddRef={addRef}
                onRemoveRef={removeRef}
                focusNonce={refFocusNonce}
              />
```

- [ ] **Step 6: Run the test to verify it passes.**

  Run: `bun test tests/appPalette.test.ts`
  Expected: PASS.

- [ ] **Step 7: Typecheck, build, and Escape-precedence regression sweep.**

  Run: `bun run typecheck` — Expected: PASS.
  Run: `bunx electron-vite build` — Expected: clean.
  Run: `bun test tests/commandPalette.test.ts tests/appPalette.test.ts tests/topBarManage.test.ts tests/branchSwitcher.test.ts` — Expected: PASS (palette Escape `stopPropagation` does not regress the TopBar/BranchSwitcher handlers).

- [ ] **Step 8: Manual smoke (commit body).** `bun run dev` → ⌘K opens the palette near the top; type to filter; ↑/↓ + Enter jump; Escape closes only the palette; with Settings open, ⌘K is inert; on a github project, "Switch ref…" closes the palette and focuses the branch select.

- [ ] **Step 9: Commit.**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/BranchSwitcher.tsx tests/appPalette.test.ts tsconfig.web.json tsconfig.node.json
git commit -m "feat(palette): App-level ⌘K keybinding, render, and BranchSwitcher focus"
```

---

# Slice E2 — File watch + live reindex (PR 3)

*Touches main, preload, shared types, and the renderer. Ships last — it reuses E3's restore path for the silent re-render and adds the only new IPC.*

## Task E2.1 — `src/main/watcher.ts` (injectable, debounced)

**Files:**
- Create: `src/main/watcher.ts`
- Create: `tests/watch.test.ts`

> `watcher.ts` is a main-process module and `watch.test.ts` is a backend (node) test — both are already covered by `tsconfig.node.json`'s `"tests"` glob with no exclude entry. No tsconfig change.

- [ ] **Step 1: Write the failing test** `tests/watch.test.ts` (this file gets a second `describe` in Task E2.3 — start with the `startWatch` unit cases):

```ts
import { describe, it, expect } from 'bun:test'
import { startWatch, type WatchFn } from '../src/main/watcher'

// A fake fs.watch: captures the change callback so the test can fire events, the options
// so we can assert the recursive flag, and a close counter so lifecycle tests can prove a
// watcher is torn down exactly once. Mirrors clone.ts injecting `spawn`.
function fakeWatch(): { fn: WatchFn; fire: () => void; opts: () => { recursive?: boolean }; closes: () => number } {
  let cb: () => void = () => {}
  let received: { recursive?: boolean } = {}
  let closed = 0
  const fn = ((_root: string, options: { recursive?: boolean }, listener: () => void) => {
    received = options
    cb = listener
    return { on: () => {}, close: () => { closed += 1 } } as never
  }) as never
  return { fn: fn as WatchFn, fire: () => cb(), opts: () => received, closes: () => closed }
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('startWatch', () => {
  it('coalesces a burst into one trailing reindex (leading edge suppressed)', async () => {
    const w = fakeWatch()
    let calls = 0
    const h = startWatch('/root', () => { calls++ }, { debounceMs: 20, watchFn: w.fn, platform: 'darwin' })
    w.fire(); w.fire(); w.fire()
    expect(calls).toBe(0) // nothing fired immediately
    await delay(40)
    expect(calls).toBe(1) // exactly one trailing fire after quiet
    h.close()
  })

  it('close() cancels a pending trailing fire', async () => {
    const w = fakeWatch()
    let calls = 0
    const h = startWatch('/root', () => { calls++ }, { debounceMs: 20, watchFn: w.fn, platform: 'darwin' })
    w.fire()
    h.close()
    await delay(40)
    expect(calls).toBe(0)
  })

  it('degrades to a non-recursive watch on linux', () => {
    const w = fakeWatch()
    const h = startWatch('/root', () => {}, { watchFn: w.fn, platform: 'linux' })
    expect(w.opts().recursive).toBe(false)
    h.close()
  })

  it('uses a recursive watch on macOS/Windows', () => {
    const w = fakeWatch()
    const h = startWatch('/root', () => {}, { watchFn: w.fn, platform: 'darwin' })
    expect(w.opts().recursive).toBe(true)
    h.close()
  })

  it('fails soft when watch throws (returns a usable no-op handle)', () => {
    const throwing = (() => { throw new Error('ENOSYS') }) as never
    const h = startWatch('/root', () => {}, { watchFn: throwing as WatchFn, platform: 'darwin' })
    expect(() => h.close()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails.**

  Run: `bun test tests/watch.test.ts`
  Expected: FAIL (`src/main/watcher.ts` does not exist).

- [ ] **Step 3: Implement** `src/main/watcher.ts`:

```ts
import { watch, type FSWatcher } from 'node:fs'

export type WatchFn = typeof watch

export interface WatchHandle {
  close: () => void
}

// Watch a local project root and coalesce a burst of fs events into a single trailing
// call to `onChange`, ~debounceMs after the last event (leading edge suppressed — the
// first event does NOT fire immediately). `watchFn` is injectable for tests (mirrors
// clone.ts injecting `spawn`). On Linux, fs.watch `recursive` is a no-op, so we degrade
// to a non-recursive root watch + a logged note; manual Reindex remains the fallback.
export function startWatch(
  root: string,
  onChange: () => void,
  opts: { debounceMs?: number; watchFn?: WatchFn; platform?: NodeJS.Platform } = {}
): WatchHandle {
  const debounceMs = opts.debounceMs ?? 300
  const watchFn = opts.watchFn ?? watch
  const platform = opts.platform ?? process.platform
  const recursive = platform !== 'linux'
  if (!recursive) {
    console.warn(
      `[watcher] recursive fs.watch is unsupported on ${platform}; nested changes may be missed — use manual Reindex.`
    )
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; onChange() }, debounceMs)
  }

  let watcher: FSWatcher | null = null
  try {
    watcher = watchFn(root, { recursive }, () => schedule())
    watcher.on('error', () => { /* fail-soft: leave the project usable; manual Reindex remains */ })
  } catch {
    // Unsupported FS / watch threw → fail-soft no-op handle (log only).
    console.warn(`[watcher] could not watch ${root}; live reindex disabled — use manual Reindex.`)
    watcher = null
  }

  return {
    close: () => {
      if (timer) { clearTimeout(timer); timer = null }
      try { watcher?.close() } catch { /* ignore */ }
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes.**

  Run: `bun test tests/watch.test.ts`
  Expected: PASS.

- [ ] **Step 5: Typecheck.**

  Run: `bun run typecheck`
  Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/main/watcher.ts tests/watch.test.ts
git commit -m "feat(watcher): injectable fs.watch with 300ms trailing debounce + Linux degrade"
```

## Task E2.2 — `IndexChanged` type + `onIndexChanged` IPC bridge

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add the payload type and the `IpcApi` method.** Edit `src/shared/types.ts`. Add the `IndexChanged` interface just after `BuildProgress`:

```ts
// Pushed main→renderer after a watcher-triggered live reindex of the ACTIVE local
// project. Mirrors build:progress in spirit but rides a captured webContents (a
// watcher fire has no IPC invoke event) — see src/main/index.ts.
export interface IndexChanged {
  projectId: string
  tree: NavNode[]
  docCount: number
}
```

  Add the subscription method to `IpcApi`, just after `onBuildProgress`:

```ts
  onBuildProgress(cb: (p: BuildProgress) => void): () => void // returns unsubscribe
  onIndexChanged(cb: (p: IndexChanged) => void): () => void // returns unsubscribe
```

- [ ] **Step 2: Add the preload bridge.** Edit `src/preload/index.ts`. Extend the type import and add the bridge method (mirrors `onBuildProgress`):

```ts
import type { IpcApi, BuildProgress, IndexChanged } from '../shared/types'
```

  Add after the `onBuildProgress` block (inside the `api` object):

```ts
  onIndexChanged: (cb) => {
    const handler = (_e: unknown, p: IndexChanged): void => cb(p)
    ipcRenderer.on('index:changed', handler)
    return () => ipcRenderer.removeListener('index:changed', handler)
  }
```

- [ ] **Step 3: Typecheck.**

  Run: `bun run typecheck`
  Expected: PASS (the preload `api` object must satisfy `IpcApi`, which now requires `onIndexChanged`).

- [ ] **Step 4: Commit.**

```bash
git add src/shared/types.ts src/preload/index.ts
git commit -m "feat(ipc): IndexChanged payload + onIndexChanged preload bridge"
```

## Task E2.3 — Watcher lifecycle + active-id-guarded push (main)

**Files:**
- Modify: `src/main/projectService.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `tests/watch.test.ts` (append the lifecycle `describe`)

- [ ] **Step 1: Append the failing lifecycle tests** to `tests/watch.test.ts`. Add these imports at the top of the file and a new `describe` block at the end:

```ts
import { beforeEach } from 'bun:test'
import { EventEmitter } from 'node:events'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setBaseDir } from '../src/main/paths'
import { addLocalProject } from '../src/main/registry'
import { selectProject, setIndexSink, stopWatch, releaseIfActive, getDoc } from '../src/main/projectService'
import { addGithubProject } from '../src/main/projectService'

// Fake git spawn that materializes a tiny repo into the clone dest (for the github case).
function repoSpawn(files: Record<string, string>): never {
  return (((_cmd: string, args: string[]) => {
    const child = new EventEmitter() as unknown as { stdout: EventEmitter; stderr: EventEmitter; kill: () => void }
    ;(child as { stdout: EventEmitter }).stdout = new EventEmitter()
    ;(child as { stderr: EventEmitter }).stderr = new EventEmitter()
    ;(child as { kill: () => void }).kill = () => {}
    queueMicrotask(async () => {
      const dest = args[args.length - 1]
      for (const [rel, content] of Object.entries(files)) {
        const abs = join(dest, rel)
        await mkdir(join(abs, '..'), { recursive: true })
        await writeFile(abs, content)
      }
      ;(child as unknown as EventEmitter).emit('close', 0)
    })
    return child as never
  }) as never)
}

describe('watcher lifecycle (projectService)', () => {
  beforeEach(async () => {
    setBaseDir(await mkdtemp(join(tmpdir(), 'dv-watch-')))
    setIndexSink(null)
  })

  async function localProject(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'dv-localproj-'))
    await writeFile(join(dir, 'a.md'), '# A')
    const p = await addLocalProject(dir)
    return p.id
  }

  it('selecting a local project starts a watcher; a fired event pushes index:changed once', async () => {
    const id = await localProject()
    const pushes: { projectId: string }[] = []
    setIndexSink((payload) => pushes.push(payload))
    const w = fakeWatch()
    await selectProject(id, { watchFn: w.fn, debounceMs: 20 })
    w.fire()
    await delay(40)
    expect(pushes.length).toBe(1)
    expect(pushes[0].projectId).toBe(id)
  })

  it('drops a watcher event for a project the user has switched away from', async () => {
    const a = await localProject()
    const b = await localProject()
    const pushes: { projectId: string }[] = []
    setIndexSink((payload) => pushes.push(payload))
    const wa = fakeWatch()
    const wb = fakeWatch()
    await selectProject(a, { watchFn: wa.fn, debounceMs: 20 })
    await selectProject(b, { watchFn: wb.fn, debounceMs: 20 }) // switch away: A's watcher is torn down
    wa.fire() // stale fire for A
    await delay(40)
    expect(pushes.filter((p) => p.projectId === a).length).toBe(0)
  })

  it('a project switch MID-reindex keeps active on the new project and pushes nothing stale (MF1)', async () => {
    const a = await localProject()
    const b = await localProject()
    const pushes: { projectId: string }[] = []
    setIndexSink((payload) => pushes.push(payload))
    const wa = fakeWatch()
    const wb = fakeWatch()
    await selectProject(a, { watchFn: wa.fn, debounceMs: 10 })
    wa.fire()                               // schedule A's trailing reindex
    await delay(15)                         // debounce elapses → reindexActive(a) is now in flight (suspended on its first await)
    await selectProject(b, { watchFn: wb.fn, debounceMs: 10 }) // switch mid-reindex: generation bumps, active = B
    await delay(15)                         // let the superseded reindex resume and hit its post-await generation guard
    // active is B (a read for B must not throw), and the superseded reindex pushed nothing for A.
    // NB: by the time A's reindex resumes, `active` and `watchedId` are BOTH already B — so the
    // generation token, not the id-equality check, is what discards the stale commit.
    await expect(getDoc(b, 'a.md')).resolves.toBeTruthy()
    expect(pushes.some((p) => p.projectId === a)).toBe(false)
  })

  it('re-selecting tears down the previous watcher and stopWatch is idempotent (MF2)', async () => {
    const id = await localProject()
    const w1 = fakeWatch()
    await selectProject(id, { watchFn: w1.fn, debounceMs: 20 })
    const w2 = fakeWatch()
    await selectProject(id, { watchFn: w2.fn, debounceMs: 20 }) // re-select must tear down w1 (no double-watch)
    expect(w1.closes()).toBe(1)
    stopWatch()                                // closes w2
    expect(w2.closes()).toBe(1)
    expect(() => stopWatch()).not.toThrow()    // idempotent no-op when nothing is watched
  })

  it('releaseIfActive stops the active local watcher and clears active (MF3)', async () => {
    const id = await localProject()
    const w = fakeWatch()
    await selectProject(id, { watchFn: w.fn, debounceMs: 20 })
    expect(w.closes()).toBe(0)
    releaseIfActive(id)
    expect(w.closes()).toBe(1)                 // watcher torn down
    await expect(getDoc(id, 'a.md')).rejects.toThrow() // active cleared → read no longer resolves
  })

  it('selecting a github project starts no watcher', async () => {
    let started = 0
    const watchFn = (() => { started++; return { on: () => {}, close: () => {} } as never }) as never
    const gh = await addGithubProject('o/r', { ref: 'main' }, () => {}, { spawnFn: repoSpawn({ 'README.md': '# R' }) })
    await selectProject(gh.id, { watchFn })
    expect(started).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails.**

  Run: `bun test tests/watch.test.ts`
  Expected: FAIL (`setIndexSink` / `stopWatch` / `releaseIfActive` are not exported; `selectProject` does not accept a `{ watchFn, debounceMs }` deps arg; there is no generation-gated reindex).

- [ ] **Step 3: Implement the watcher lifecycle in** `src/main/projectService.ts`.

  Add the watcher import near the other imports:

```ts
import { startWatch, type WatchFn, type WatchHandle } from './watcher'
```

  Add a sink + watcher state, a **generation token**, an idempotent/throw-safe `stopWatch`, `releaseIfActive`, and a generation-gated reindex near the existing module state (after `const noProgress = ...`):

```ts
// index:changed sink — wired by src/main/index.ts to the captured window webContents.
type IndexSink = (payload: { projectId: string; tree: NavNode[]; docCount: number }) => void
let indexSink: IndexSink | null = null
export function setIndexSink(sink: IndexSink | null): void { indexSink = sink }

// The single active watcher (local projects only). Replaced on every selectProject.
let watchHandle: WatchHandle | null = null
let watchedId: string | null = null
type SelectDeps = { watchFn?: WatchFn; debounceMs?: number }

// Monotonic token gating the reindex commit (MF1). Bumped on every project switch /
// teardown, so a debounced reindex whose async discover/parse/index work straddles a
// switch is discarded — even when `active`/`watchedId` have ALREADY been reassigned to
// the new project (so id-equality alone is insufficient; the generation is load-bearing).
let generation = 0

// Idempotent + throw-safe (MF2): a no-op when nothing is watched; never lets a failing
// handle.close() escape. Bumps `generation` so any in-flight reindex is superseded.
export function stopWatch(): void {
  generation += 1
  if (!watchHandle) return
  try { watchHandle.close() } catch { /* fail-soft: a broken FSWatcher must not crash teardown */ }
  watchHandle = null
  watchedId = null
}

// Deleting the active project tears down its watcher and clears `active` (MF3). Wired
// into the projects:remove IPC handler in ipc.ts.
export function releaseIfActive(id: string): void {
  if (active?.id === id) { stopWatch(); active = null }
}

// Generation-gated reindex (MF1): capture the token BEFORE the long async work, build the
// next ActiveProject WITHOUT touching the module `active`, and only commit (`active = …`)
// + push index:changed if neither a switch (generation) nor a teardown
// (active?.id === watchedId) intervened. Superseded → discard, push nothing.
async function reindexActive(id: string): Promise<void> {
  if (active?.id !== id || watchedId !== id) return
  const project = await getProject(id)
  if (!project || project.type !== 'local') return
  const gen = generation
  const built = await buildLocalActive(project) // does NOT assign the module `active`
  if (generation !== gen || active?.id !== watchedId) return // superseded mid-reindex: discard
  active = built.next
  indexSink?.({ projectId: id, tree: built.tree, docCount: built.docCount })
}

function startProjectWatch(project: LocalProject, deps: SelectDeps): void {
  watchedId = project.id
  watchHandle = startWatch(project.source, () => { void reindexActive(project.id) }, {
    watchFn: deps.watchFn,
    debounceMs: deps.debounceMs
  })
}
```

  **Refactor `selectLocal`** to split the discover/parse/index work from the `active` commit, so the reindex path can build a candidate without unconditionally clobbering `active`. Replace the existing `selectLocal` with `buildLocalActive` (no commit) + a thin `selectLocal` (commits):

```ts
// Walk a local project root and build the would-be ActiveProject WITHOUT assigning the
// module `active`. The reindex path gates the commit on the generation token; selectLocal
// commits unconditionally.
async function buildLocalActive(
  project: Project & { type: 'local' }
): Promise<{ next: ActiveProject; tree: NavNode[]; docCount: number }> {
  const root = project.source
  const discovered = await discover(root)
  const docs: ParsedDoc[] = []
  for (const d of discovered) {
    if (d.kind === 'md') {
      const raw = await readFile(safeResolve(root, d.path), 'utf8')
      docs.push(parseMarkdown(d.path, d.path.split('/').pop()!, raw))
    } else {
      docs.push(parseHtml(d.path, d.path.split('/').pop()!))
    }
  }
  const sections = docs.flatMap((d) => d.sections)
  const index = buildIndex(sections)
  const tree = buildTree(docs)
  await updateProject(project.id, {
    docCount: docs.length,
    lastBuiltAt: new Date().toISOString(),
    status: 'ok'
  })
  return {
    next: { id: project.id, type: 'local', root, docs: new Map(docs.map((d) => [d.path, d])), index, tree },
    tree,
    docCount: docs.length
  }
}

async function selectLocal(project: Project & { type: 'local' }): Promise<{ tree: NavNode[]; docCount: number }> {
  const built = await buildLocalActive(project)
  active = built.next // commit (unguarded — caller-initiated select/rebuild)
  return { tree: built.tree, docCount: built.docCount }
}
```

  Add `LocalProject` to the `@shared/types` import (it currently imports `Project, GithubProject, ...` but not `LocalProject`):

```ts
import type {
  NavNode, ParsedDoc, SearchResult, DocKind, Project, LocalProject, GithubProject, BuildProgress
} from '@shared/types'
```

  Change `selectProject` to accept `SelectDeps`, tear down the prior watcher on every selection, and start a watcher only for local projects:

```ts
export async function selectProject(id: string, deps: SelectDeps = {}): Promise<{ tree: NavNode[]; docCount: number }> {
  const project = await getProject(id)
  if (!project) throw new Error(`Project not found: ${id}`)
  stopWatch()      // every active replacement tears down the previous watcher (also bumps `generation`)
  generation += 1  // explicit: supersede any reindex still in flight from the prior project (MF1)
  active = null    // tear down previous (active-Project lifecycle)
  if (project.type === 'github') return loadGithubRef(project, project.currentRef, noProgress, {})
  const res = await selectLocal(project)
  startProjectWatch(project, deps)
  return res
}
```

  (The reindex path calls `buildLocalActive` directly — **not** `selectLocal` — so its commit is generation-gated; and neither touches the watcher, so a reindex never restarts/leaks the watch. `getProject` and `selectLocal` already narrow `project.type === 'local'`, so passing `project` to `startProjectWatch(project, ...)` is type-safe as `LocalProject`. The `generation += 1` is belt-and-suspenders alongside `stopWatch`'s bump — it keeps the supersede invariant even if a future refactor selects without tearing down.)

- [ ] **Step 4: Capture the window's `webContents` and wire the sink** in `src/main/index.ts`. Add the import and wire the sink inside `createWindow()` (after the `win` is created), clearing it on `'closed'`:

```ts
import { setIndexSink, stopWatch } from './projectService'
```

  Inside `createWindow()`, after `win.on('ready-to-show', ...)`:

```ts
  // Capture this window's webContents so the file watcher can push index:changed
  // outside any IPC invoke (a watcher event has no `e.sender`). On close, clear the sink
  // AND stop the watcher (MF2) so no fs.watch handle outlives the window.
  setIndexSink((payload) => {
    if (!win.webContents.isDestroyed()) win.webContents.send('index:changed', payload)
  })
  win.on('closed', () => { setIndexSink(null); stopWatch() })
```

  > Optional hardening: for a multi-window or quit-without-`'closed'` path you can also call `stopWatch()` from an app-level `app.on('before-quit', …)` handler. Single-window today, so the `'closed'` teardown is sufficient; `stopWatch()` is idempotent, so a redundant `before-quit` call is safe.

- [ ] **Step 4b: Wire `releaseIfActive` into the `projects:remove` handler (MF3).** Edit `src/main/ipc.ts`. Import `releaseIfActive` alongside the other `projectService` imports and call it in the `projects:remove` handler so deleting the **active** local project tears down its watcher and clears `active` (otherwise a deleted project's `fs.watch` would keep firing into a stale `active`):

```ts
import {
  selectProject, getDoc, search,
  addGithubProject, rebuildProject, cancelBuild,
  listRefs, switchRef, addRef, removeRef, setDocsSubpath, releaseIfActive
} from './projectService'
```

```ts
  ipcMain.handle('projects:remove', async (_e, id: string) => {
    releaseIfActive(id)         // stop the watcher + clear active if this is the open project
    await purgeProjectCache(id) // remove derived cache (no-op for local)
    await removeProject(id)
  })
```

- [ ] **Step 5: Run the test to verify it passes.**

  Run: `bun test tests/watch.test.ts`
  Expected: PASS.

- [ ] **Step 6: Typecheck and full main-suite regression.**

  Run: `bun run typecheck` — Expected: PASS.
  Run: `bun test tests/projectService.test.ts tests/githubProjectService.test.ts tests/setDocsSubpath.test.ts tests/watch.test.ts` — Expected: PASS (the new optional `deps` arg on `selectProject` is backward-compatible with existing callers).

- [ ] **Step 7: Commit.**

```bash
git add src/main/projectService.ts src/main/index.ts src/main/ipc.ts tests/watch.test.ts
git commit -m "feat(watch): projectService watcher lifecycle + generation-gated index:changed push + releaseIfActive"
```

## Task E2.4 — Renderer subscription, live re-render, and removed-doc notice

**Files:**
- Modify: `src/renderer/src/components/DocView.tsx`
- Modify: `src/renderer/src/App.tsx`
- Create: `tests/indexChanged.test.ts`
- Modify: `tsconfig.web.json`, `tsconfig.node.json`

- [ ] **Step 1: Register the test file.** In `tsconfig.web.json`, append `"tests/indexChanged.test.ts"` to `"include"`; in `tsconfig.node.json`, append it to `"exclude"`.

- [ ] **Step 2: Add a `reloadNonce` refetch trigger to DocView.** Edit `src/renderer/src/components/DocView.tsx`. Add `reloadNonce` to `Props` and include it in the `getDoc` effect deps so a live re-index forces a refetch of the same `docPath`:

```ts
interface Props {
  projectId: string
  docPath: string
  scrollToId: string | null
  scrollNonce: number
  restoreHeadingId?: string | null
  reloadNonce?: number
  onToc?: (toc: TocEntry[]) => void
  onStats?: (stats: DocStats | null) => void
}
```

  Destructure `reloadNonce` and change the `getDoc` effect's dependency array from `[projectId, docPath]` to include it:

```ts
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const doc = await window.api.getDoc(projectId, docPath)
      if (cancelled) return
      setKind(doc.kind)
      setHtml(doc.kind === 'md' ? renderMarkdown(doc.content) : doc.content)
    })()
    return () => { cancelled = true }
  }, [projectId, docPath, reloadNonce])
```

- [ ] **Step 3: Write the failing test** `tests/indexChanged.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import type { Project, NavNode, IndexChanged } from '../src/shared/types'
import { stubLocalStorage } from './helpers/localStorage'

let container: HTMLDivElement
let root: Root
let restoreLs: () => void
let indexCb: ((p: IndexChanged) => void) | null = null

const A: Project = { id: 'a', name: 'Alpha', type: 'local', source: '/tmp/a', addedAt: 'now', status: 'ok', docCount: 1 }
const treeWith: NavNode[] = [{ type: 'doc', name: 'r.md', title: 'R', path: 'r.md', kind: 'md' }]
const treeWithout: NavNode[] = [{ type: 'doc', name: 's.md', title: 'S', path: 's.md', kind: 'md' }]

beforeEach(() => {
  indexCb = null
  if (!window.matchMedia) {
    ;(window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: false, addEventListener: () => {}, removeEventListener: () => {}
    })
  }
  restoreLs = stubLocalStorage()
  ;(window as unknown as { api: Partial<Window['api']> }).api = {
    listProjects: async () => [A],
    selectProject: async () => ({ tree: treeWith, docCount: 1 }),
    getDoc: async () => ({ kind: 'md', content: '# R' }),
    onBuildProgress: () => () => {},
    onIndexChanged: (cb) => { indexCb = cb; return () => {} }
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => { restoreLs() })

async function mountAndOpen(): Promise<void> {
  await act(async () => { root.render(createElement(App)) })
  await act(async () => {})
  // select Alpha via the project dropdown, then open its one doc
  const select = container.querySelector('.topbar-select') as HTMLSelectElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select, 'a')
    select.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
  await act(async () => {})
  await act(async () => { (container.querySelector('.tree-item') as HTMLButtonElement).click() })
  await act(async () => {})
}

describe('App index:changed handling', () => {
  it('updates the tree when the open doc is still present (stays open)', async () => {
    await mountAndOpen()
    await act(async () => { indexCb!({ projectId: 'a', tree: treeWith, docCount: 1 }) })
    expect(container.querySelector('.tree-item')).toBeTruthy()
    expect(container.textContent).not.toContain('This document was removed.')
  })

  it('shows "This document was removed." when the open doc disappears', async () => {
    await mountAndOpen()
    await act(async () => { indexCb!({ projectId: 'a', tree: treeWithout, docCount: 1 }) })
    expect(container.textContent).toContain('This document was removed.')
  })

  it('ignores a push for a non-active project', async () => {
    await mountAndOpen()
    await act(async () => { indexCb!({ projectId: 'other', tree: treeWithout, docCount: 0 }) })
    expect(container.textContent).not.toContain('This document was removed.')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails.**

  Run: `bun test tests/indexChanged.test.ts`
  Expected: FAIL (App does not subscribe to `onIndexChanged`; no removed-doc notice).

- [ ] **Step 5: Implement the App subscription + removed-doc notice.** Edit `src/renderer/src/App.tsx`.

  Add state near the other `useState`s:

```tsx
  const [docRemoved, setDocRemoved] = useState(false)
  const [docReloadNonce, setDocReloadNonce] = useState(0)
```

  Subscribe to `onIndexChanged` (preserve the open doc via the existing `treeHasPath`; force a DocView refetch and re-apply the saved scroll anchor when it survives; otherwise show the removed notice):

```tsx
  // Live reindex push for the ACTIVE local project (E2). Update the tree; keep the open
  // doc if it survives (silent re-render with preserved scroll), else show the notice.
  useEffect(() => {
    return window.api.onIndexChanged(({ projectId, tree: nextTree }) => {
      if (projectId !== activeId) return
      setTree(nextTree)
      if (!docPath) return
      if (treeHasPath(nextTree, docPath)) {
        setRestoreHeadingId(sessionRef.current.perProject[activeId]?.headingId ?? null)
        setDocReloadNonce((n) => n + 1) // force DocView to refetch the same path
      } else {
        setDocPath(null)
        resetDocState()
        setDocRemoved(true)
      }
    })
  }, [activeId, docPath, resetDocState])
```

  Clear the removed-notice whenever a doc opens or the project changes. Add `setDocRemoved(false)` inside the existing `openDoc` callback (alongside the other setters) and inside `selectProject` (after `setActiveId(id)`):

```tsx
    setDocRemoved(false)
```

  Pass `reloadNonce` to DocView (add the one prop to the existing `<DocView .../>` usage):

```tsx
                restoreHeadingId={restoreHeadingId}
                reloadNonce={docReloadNonce}
                onToc={setToc}
                onStats={setStats}
```

  Render the removed-doc notice as a distinct empty-content branch. Change the content empty-state region so the `activeId && docPath ? <DocView> : ...` ternary gains a `docRemoved` branch before the generic empty state:

```tsx
            ) : docRemoved ? (
              <div className="empty-state" data-removed>
                <i className="empty-icon fa-solid fa-file-circle-xmark" aria-hidden="true" />
                <p>This document was removed.</p>
              </div>
            ) : (
              <div className="empty-state">
                <i
                  className={`empty-icon fa-solid ${activeId ? 'fa-file-lines' : 'fa-folder-open'}`}
                  aria-hidden="true"
                />
                <p>{activeId ? 'Select a document.' : 'Add or select a project to begin.'}</p>
              </div>
            )}
```

- [ ] **Step 6: Run the test to verify it passes.**

  Run: `bun test tests/indexChanged.test.ts`
  Expected: PASS.

- [ ] **Step 7: Typecheck, build, and full-suite sweep.**

  Run: `bun run typecheck` — Expected: PASS.
  Run: `bunx electron-vite build` — Expected: clean.
  Run: `bun test` — Expected: PASS (whole suite green).

- [ ] **Step 8: Manual smoke (commit body).** `bun run dev` → open a local project + doc, edit the file in your editor → after ~300 ms the sidebar refreshes and the open doc re-renders in place with scroll preserved. Add/remove files → the tree updates. Delete the open doc → the pane shows "This document was removed." Switch projects mid-edit → a late reindex for the old project is dropped.

- [ ] **Step 9: Commit.**

```bash
git add src/renderer/src/components/DocView.tsx src/renderer/src/App.tsx tests/indexChanged.test.ts tsconfig.web.json tsconfig.node.json
git commit -m "feat(watch): renderer onIndexChanged — live re-render, preserve scroll, removed-doc notice"
```

---

## Self-Review Notes

**Spec coverage (design spec → tasks):**
1. E3 `lib/session.ts` (localStorage, mirrors theme.ts; per-project `{ docPath, anchor }`) + pure nearest-heading anchor → **Task E3.1**.
2. E3 DocView parallel `restoreHeadingId` post-`enhanceDiagrams` path (not overloading `scrollToId`/`scrollNonce`) → **Task E3.2**.
3. E3 App throttled (~250 ms) scroll-save + restore-on-launch with the 4-case guard (project missing/unavailable, doc gone, build stale/in-progress via `await selectProject`, first-run) → **Task E3.3**.
4. E4 `lib/fuzzy.ts` rank-only prefix/contiguous-favoring scorer returning a single score → **Task E4.1**.
5. E4 `CommandPalette.tsx` — empty query = Projects + Commands + "Type to search documents…" hint (no Documents tier), typing surfaces Documents, ~50 cap + "…and N more — keep typing" overflow, no-match copy, tier-grouped/ranked, keyboard (↑/↓ wrap skipping headers, Enter, Escape topmost-only), a11y (dialog/listbox/option, `aria-activedescendant`) → **Task E4.2**; `.palette-*` styles → **Task E4.3**.
6. E4 App-level ⌘K/Ctrl+K (`preventDefault`, fires over a focused input, suppressed when a modal is open) + render + "Switch ref…" opening/focusing the existing BranchSwitcher (palette closes) → **Task E4.4**.
7. E2 `src/main/watcher.ts` (injectable `fs.watch`, 300 ms trailing/leading-suppressed debounce, Linux degrade, fail-soft) → **Task E2.1**.
8. E2 `IndexChanged` payload + `IpcApi.onIndexChanged` + preload bridge → **Task E2.2**.
9. E2 watcher lifecycle (start after a local `selectProject`, tear down on every `active` replacement + on window `'closed'` + on delete of the active project), **generation-gated** `index:changed` push (MF1) through the `webContents` captured in `src/main/index.ts`, idempotent/throw-safe `stopWatch` (MF2), `releaseIfActive` wired into `projects:remove` (MF3), github-never-watched → **Task E2.3**.
10. E2 renderer subscription (tree update, preserve open doc via `treeHasPath` + live re-render with preserved scroll, "This document was removed." `.empty-state` with `fa-file-circle-xmark`, ignore non-active push) → **Task E2.4**.

**Verbatim copy used:** placeholder "Search projects, docs, and commands…"; "Type to search documents…"; "…and N more — keep typing"; "No matches."; group headers "Projects" / "Documents · <name>" / "Commands"; command labels "Add project" / "Manage projects" / "Reindex" (local) / "Pull latest" (github) / "Switch ref…" / "Settings"; "This document was removed." / "Select a document." / "Add or select a project to begin."

**Reconciliation decisions / assumptions (flag for review):**
- **`treeHasPath` reuse, not redefine:** it already exists at App.tsx lines 32–41 (Plan 3). E3's restore and E2's preserve both call it as-is.
- **Launch race fix:** restore can't run in an effect keyed on `projects` (the first value is `[]` before `listProjects` resolves, which would consume the restore prematurely). The plan **replaces** the mount `refreshProjects` effect with a combined `listProjects()` → `setProjects` → restore routine so restore sees the loaded list. `refreshProjects` stays for all later refreshes.
- **DocView restore is a ref-read parallel path:** `restoreRef.current` is read inside the existing post-enhance `.then`, only when `targetRef.current` (a Contents/search jump) is absent — jumps always win, restore is best-effort/silent. E2's live re-render reuses the *same* path by setting `restoreHeadingId` + bumping `reloadNonce` (which is in the `getDoc` deps) so the same `docPath` refetches and re-anchors.
- **`CSS` test global:** `setup-dom.ts` did not register `CSS`; DocView's restore/jump uses `CSS.escape`. Added `'CSS'` to the registration list (jsdom provides `window.CSS.escape`) so App-level tests that render DocView don't throw. Harmless to all other tests.
- **`localStorage` in tests:** neither `setup-dom.ts` nor a global provides a deterministic `localStorage`; session.ts uses the bare global (like theme.ts). The session/restore/palette/indexChanged tests install an in-memory `localStorage` stub in `beforeEach`. (Runtime renderer behavior is unchanged — bare `localStorage` is `window.localStorage`.)
- **"Switch ref…" mechanism:** the BranchSwitcher is an always-present inline `<select>`, not a modal — there is nothing to "open". The command therefore **closes the palette and focuses** the select via a new `focusNonce` prop (bumped by App; BranchSwitcher focuses on change, skipping the initial 0). No inline ref sub-items, matching the decision.
- **index:changed push lives in `index.ts`, not `ipc.ts`:** the push has no IPC invoke event, so it cannot use `progressTo(e)`. `index.ts` owns the window, so it wires `projectService.setIndexSink()` to `win.webContents.send(...)` (with an `isDestroyed()` guard) and on `'closed'` both clears the sink and calls `stopWatch()` (MF2). `ipc.ts` is modified **once** by E2 — the `projects:remove` handler calls `releaseIfActive(id)` (MF3) — but the push channel itself never touches it.
- **MF1 reindex race (generation token):** the debounced reindex must not call `selectLocal` (which unconditionally sets `active`). It calls `buildLocalActive` (no commit), capturing `const gen = generation` before the async work, and commits `active` + pushes `index:changed` only if `generation === gen && active?.id === watchedId` still hold afterward. The generation is load-bearing because, by the time a superseded reindex resumes, `active`/`watchedId` may already both be the NEW project — an id-equality check alone would pass. `generation` is bumped in `stopWatch` and in `selectProject`.
- **MF5 StrictMode latch:** the combined launch/restore effect is guarded by a `didRunRef` (`useRef(false)`) so React.StrictMode's dev double-invoke doesn't fire two concurrent `selectProject` restores. The session object is read once via a lazy `useState(loadSession)` initializer (a bare `useRef(loadSession())` re-reads localStorage every render).
- **MF4 palette view switch:** the palette's `onOpenDoc` (and `onSwitchRef`) are wrapped with `setView('docs')` in App so activating a Document/jump while `view === 'manage'` makes the result visible (`onSelectProject` already sets the docs view inside `selectProject`).
- **D4-15 localStorage test helper:** the per-file inline stub is replaced by `tests/helpers/localStorage.ts`'s `stubLocalStorage()`, which saves the original `globalThis.localStorage` property descriptor and returns a teardown that restores it (or deletes if none existed). Every session/restore/palette/indexChanged test calls it in `beforeEach`/per-test and restores in `afterEach`. The helper is web-only (DOM `Storage` type) so it is added to `tsconfig.web.json` include + `tsconfig.node.json` exclude.
- **`selectProject(id, deps?)`:** an optional `{ watchFn?, debounceMs? }` second arg was added for test injection (mirrors `clone.ts`/`build.ts` injecting `spawn`). It is backward-compatible — `ipc.ts`'s `projects:select` handler still calls `selectProject(id)` unchanged, and the renderer `IpcApi.selectProject(id)` signature is untouched (deps is main-internal only).
- **Watcher restart safety:** `reindexActive` calls `buildLocalActive` (neither it nor `selectLocal` manages the watcher), so a reindex never restarts/leaks the watch. The watcher is started once per local `selectProject` and torn down by the idempotent `stopWatch()` on the next `selectProject` (every `active` replacement), on window `'closed'`, and on `releaseIfActive` when the active project is deleted.
- **Debounce numbers:** production watcher debounce is 300 ms (default in `startWatch`); tests pass `debounceMs: 20` for speed. E3 scroll-save throttle is 250 ms trailing.
- **No new dependencies:** `node:fs` watch, hand-rolled `lib/fuzzy.ts`, and `localStorage` — consistent with the cannot-npm-install constraint.

**Accepted-for-v1 (no task):** a live reindex re-applies the saved scroll anchor (`restoreHeadingId`) rather than the user's *current* in-doc scroll position, so a manual Contents jump made between edits is not re-honored after a reload — acceptable v1 precedence. Watcher failures (`fs.watch` throw / `'error'`) fail soft to "manual Reindex" with only a `console.warn`; there is no user-facing watcher-error surface in v1.

**Scope honored:** rank-only fuzzy (no `<mark>` — deferred fast-follow); Documents hard-capped (no virtualization); palette tier 3 (cross-project GitHub docs), incremental reindex, Linux recursive watch, and a main-side settings file all remain out of scope per the spec.
```

