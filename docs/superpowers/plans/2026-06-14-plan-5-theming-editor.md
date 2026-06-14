# Plan 5 — Theming Editor (Curated Preset Library) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each task is TDD: write a failing test, run it (expect FAIL), implement complete code (no placeholders), run it (expect PASS), typecheck/build where relevant, then commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Curator's two-region chrome/document theme toggles with a **curated library of 4 built-in presets** (Default, Sepia, High contrast, Graphite) applied at runtime by layering whitelisted CSS-custom-property overrides over the existing `data-theme="dark|light"` base palettes — chosen globally in a Settings **gallery** and overridable **per project**, applied to BOTH chrome and document.

**Architecture:** A new theme model in `lib/theme.ts` (`Theme` = `{ base, variants }` where `variants.{dark,light}` are `TokenOverrides`), a registry-validated `THEMEABLE_TOKENS` whitelist, a pure `resolveTheme(theme, systemDark, region) → { mode, overrides }`, and an imperative `applyTheme(el, mode, overrides)` that sets `data-theme` and writes/clears inline `--token` props. `App` resolves `project theme → global theme → Default` and applies it imperatively to refs on `.app-shell` (chrome) and `.content` (document). Per-project `themeId` widens from the `ThemeChoice` enum to a registry id **string** (legacy values migrate to "use global" / Default). Preview is **swatch-only** (token-faithful card swatches; only a commit recolors). Persistence reuses the existing stores — no new IPC, no `userData/themes/`.

**Tech Stack:** Electron, electron-vite, React 19, TypeScript, `bun test` (native runner, `import from 'bun:test'`), jsdom renderer tests via the `bunfig.toml` preload (`react-dom/client` `createRoot` + `act` + `React.createElement`). **NO npm-install** — Node built-ins + `localStorage` only.

**Spec:** `docs/superpowers/specs/2026-06-14-plan-5-theming-editor-design.md` (source of truth for scope, presets, copy, states; decisions D5-1…D5-12). **Predecessors:** Plan 1 (local viewer), Plan 2a/2b (GitHub backend + UI), Plan 3 (Manage Projects + EditProjectModal), **Plan 4 (session memory, command palette, file watch)**.

---

## Reconciliation with current code (read before starting)

The original spec referenced pre-Plan-3/4 line numbers. Plan 3 and Plan 4 are **merged on `main`**; reconcile against these CURRENT facts:

- **`src/shared/types.ts`** — `ThemeChoice = 'dark' | 'light' | 'system'` and `THEME_CHOICES` live here (lines 43–44) and are still referenced by `tests/manageTypes.test.ts` and `lib/theme.ts`'s legacy code; **keep them exported.** `ProjectBase.themeId?: ThemeChoice` (line 53) widens to `string`. `IpcApi.updateProjectSettings(id, { name?; docsSubpath?; themeId?: ThemeChoice })` (lines 130–133) widens `themeId` to `string`. `IndexChanged` (Plan 4 E2, lines 104–109) and `onIndexChanged` (line 147) must stay untouched.
- **`src/renderer/src/lib/theme.ts`** — TODAY a two-region model: `ThemeSettings = { chrome, document }`, `DEFAULT_THEME = { chrome: 'dark', document: 'light' }`, `resolveTheme(choice, systemDark): 'dark'|'light'`, `loadThemeSettings`/`saveThemeSettings` over `localStorage['curator.theme']`. Plan 5 adds the new model and **renames the legacy API to `Region*`** (T2, mechanical) before **deleting it** (T3).
- **`src/renderer/src/App.tsx`** — POST-PLAN-4. Already imports `CommandPalette` + `lib/session`, owns `paletteOpen`/`refFocusNonce`/the ⌘K keydown (lines 71–72, 289–299), `restoreHeadingId`/`docReloadNonce`, the launch restore effect (lines 97–127), the scroll-anchor effect on `mainRef` (lines 250–271), and the `onIndexChanged` effect (273–287). **`mainRef` already exists (line 58) and is attached to `<main className="content">` (line 330).** Theme today: `chromeTheme`/`docTheme` derived via the legacy `resolveTheme` (lines 84–85), applied as static `data-theme={chromeTheme}` on `.app-shell` (line 305) and `data-theme={docTheme}` on `.content` (line 330). `setProjectTheme(id, themeId: ThemeChoice | undefined)` (line 220). Plan 5 replaces the derive-and-static-attr approach with an **imperative `applyTheme` effect** on a new `appShellRef` + the existing `mainRef`, and makes the per-project theme drive **both** regions (today document-only). **Do not regress** the session-restore launch effect, the scroll-anchor effect, the `onIndexChanged` effect, or the palette gate.
- **`src/renderer/src/components/Settings.tsx`** — two `Segmented` controls (Chrome / Document). Plan 5 **replaces the body** with the theme gallery. It receives `settings`/`onChange`/`onClose` props from App; the gallery is prop-coupled to App's theme state, so **App resolution + Settings gallery land in the same commit (T3).**
- **`src/renderer/src/components/EditProjectModal.tsx`** — Plan 3's per-project settings modal (opened from `ManageProjects`). Has a `<select data-role="theme-select">` with `{Global / Dark / Light / System}` and label "Document theme" (lines 4–9, 96–108). Plan 5 generalizes it to `{Use global}` + the theme list, relabels it "Theme", and adds a token-faithful swatch chip (T4).
- **`src/renderer/src/components/ManageProjects.tsx`** — passes `onSetTheme: (id, themeId: ThemeChoice | undefined)` to EditProjectModal. Widen the signature to `string`; thread an optional `globalThemeId` for the chip.
- **`src/main/ipc.ts`** — `projects:updateSettings` handler (lines 31–35) types `patch.themeId?: ThemeChoice`; widen to `string` and validate against the registry id set (unknown → drop to "use global"). **`registry.ts`** `updateProject(id, patch)` flows `themeId` through `ProjectPatch` (derived from `Project`), so the widened `ProjectBase.themeId: string` propagates automatically; the IPC handler is where validation/normalization happens.
- **Renderer test harness (critical):** tests run under `bun test` with `tests/setup-dom.ts` (jsdom) preloaded via `bunfig.toml`. `setup-dom.ts` ALREADY registers `CSS` (Plan 4) but does **not** register `localStorage` — theme tests install the deterministic stub via the shared `tests/helpers/localStorage.ts` `stubLocalStorage()` (Plan 4) in `beforeEach` and restore in `afterEach`. Component tests (1) render via `react-dom/client` `createRoot` + `act` + `React.createElement`, (2) dispatch DOM events with `new window.Event(...)` / `new window.KeyboardEvent(...)`, (3) set `<select>`/`<input>` values via the prototype `value` setter + a `change`/`input` event, and (4) are listed in `tsconfig.web.json` `"include"` and `tsconfig.node.json` `"exclude"`. Patterns: `tests/addProjectModal.test.ts`, `tests/editProjectModal.test.ts`, `tests/sessionRestore.test.ts`.
- **jsdom inline styles:** jsdom implements `HTMLElement.style.setProperty`/`removeProperty`/`getPropertyValue` and `getAttribute('data-theme')`, so `applyTheme` is fully testable under the harness.
- **Commands:** `bun test <file>`, `bun run typecheck` (runs `typecheck:node` then `typecheck:web`), `bunx electron-vite build`. Run `bun test <file>` per task; do not background a full-suite run mid-task.

### Legacy `themeId` migration mapping (decided)

- **Per-project `themeId`** (registry): legacy values are `'dark' | 'light' | 'system'`. None is a `BUILTIN_THEMES` id, so **all three collapse to "use global"** (drop the field) — this falls out of the unknown-id validation in the IPC handler; no bespoke mapping table. (Considered + rejected: `'dark' → graphite`, `'light' → sepia`.)
- **Global `localStorage['curator.theme']`** (renderer): legacy `{ chrome, document }` (or malformed/absent) → `{ themeId: DEFAULT_THEME_ID }`, which reproduces the default mixed look. Custom per-region combos are not preserved (per-region advanced override is deferred).

> **Per-project cleanup is write-time only (D5-14 / P5-DP2).** A stale `'dark' | 'light' | 'system'` is dropped only when `updateProjectSettings` is next called for that project (the unknown-id validation in the IPC handler). There is NO read-path normalization: a lingering legacy value is **inert** — `themeById()` resolves any unknown id to Default at runtime, so an un-rewritten project simply uses global Default until its settings are next saved. The eventual closer (deferred, out of this plan) is a one-shot **versioned migration** that rewrites all stored projects in a single pass — warranted only IF the legacy `ThemeChoice` enum is ever removed from the type (today it stays exported for back-compat and `tests/manageTypes.test.ts`).

---

## File Structure

```
MODIFIED
  src/shared/types.ts                              # ProjectBase.themeId: string; updateProjectSettings patch themeId: string (T1)
  src/main/ipc.ts                                  # updateSettings handler: themeId: string + validate ∈ registry, drop unknown (T1)
  src/renderer/src/components/ManageProjects.tsx   # onSetTheme themeId: string; optional globalThemeId thread-through (T1/T4)
  src/renderer/src/components/EditProjectModal.tsx # onSetTheme themeId: string (T1); then Use-global + theme list + swatch chip (T4)
  src/renderer/src/lib/theme.ts                    # NEW Theme model, THEMEABLE_TOKENS, BUILTIN_THEMES (4 presets), resolveTheme(region),
                                                   #   applyTheme, swatchColors, ThemeSettings/load/save migration; legacy → Region* (T2), deleted (T3)
  src/renderer/src/App.tsx                         # imperative applyTheme on appShellRef + mainRef; per-project both regions;
                                                   #   resolution precedence; remove static data-theme attrs + legacy derive (T2 rename, T3 rewrite)
  src/renderer/src/components/Settings.tsx         # theme gallery replaces the two Segmented controls (T3)
  src/renderer/src/styles.css                      # .theme-gallery / .theme-card / .theme-swatch / .project-theme-chip (T5)
  tsconfig.web.json                                # include tests/theme.test.ts, tests/themeGallery.test.ts, tests/projectThemeSelect.test.ts
  tsconfig.node.json                               # exclude the same three test files
  tests/editProjectModal.test.ts                   # update for the generalized option set (T4)

CREATED
  tests/theme.test.ts                              # resolveTheme + applyTheme + migration + registry whitelist + swatchColors (web tsconfig)
  tests/themeGallery.test.ts                       # Settings gallery render/select/swatch-only-preview (jsdom harness)
  tests/projectThemeSelect.test.ts                 # EditProjectModal generalized select + swatch chip (jsdom harness)
```

---

## Task T1 — Widen `themeId` to a registry theme-id string (types + ipc + consumer signatures)

*The invasive Plan-3/4-touching slice. Isolated first; re-run the full gate set after it lands. Pure type widening — `'dark' | 'light' | 'system'` is assignable to `string`, so existing literals still compile; `ThemeChoice`/`THEME_CHOICES` stay exported for back-compat and `tests/manageTypes.test.ts`.*

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/renderer/src/components/ManageProjects.tsx`
- Modify: `src/renderer/src/components/EditProjectModal.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `tests/editProjectModal.test.ts` (annotation widening only — keeps `typecheck:web` green under the new signature; logic corrections land in T4)

> No isolated unit test — this is a type change verified by `bun run typecheck` + the existing suite (`tests/manageTypes.test.ts`, `tests/editProjectModal.test.ts`). The first explicit failing/ passing unit test arrives in T2.

- [ ] **Step 1: Widen `ProjectBase.themeId` and the IPC patch type** in `src/shared/types.ts`.

  Change line 53:

```ts
  themeId?: string // per-project theme id (registry id; absent = use global). Plan 5 widened from ThemeChoice.
```

  Change the `updateProjectSettings` patch (lines 130–133):

```ts
  updateProjectSettings(
    id: string,
    patch: { name?: string; docsSubpath?: string; themeId?: string }
  ): Promise<Project>
```

  Leave `ThemeChoice`/`THEME_CHOICES` (lines 43–44) exactly as-is.

- [ ] **Step 2: Widen + validate `themeId` in the IPC handler** `src/main/ipc.ts`.

  The validation references the renderer registry's id set. To keep main free of a renderer import, inline the known built-in ids as the source of truth here (they are app-side config; mirrored in `lib/theme.ts`). Replace the import line and the handler:

```ts
import type { BuildProgress } from '@shared/types'
```

  (drop the now-unused `ThemeChoice` from that import). Add a module-level constant near the top of the file, after the imports:

```ts
// Built-in theme ids — keep in sync with BUILTIN_THEMES in
// src/renderer/src/lib/theme.ts (cross-ref: this Set IS the main-process mirror of
// Object.keys(BUILTIN_THEMES); main must not import the renderer module). A per-project
// themeId that is not one of these is dropped to "use global" — this is also the
// legacy-value migration: 'dark' | 'light' | 'system' all collapse to undefined.
const BUILTIN_THEME_IDS = new Set(['default', 'sepia', 'high-contrast', 'graphite'])
```

  Replace the `projects:updateSettings` handler (lines 31–35):

```ts
  ipcMain.handle(
    'projects:updateSettings',
    (_e, id: string, patch: { name?: string; docsSubpath?: string; themeId?: string }) => {
      // Write-time-only cleanup (D5-14): a lingering legacy themeId is INERT at runtime
      // (themeById() resolves any unknown id to Default), so dropping it here is cleanup,
      // not correctness — there is no read-path normalization.
      const themeId = patch.themeId && BUILTIN_THEME_IDS.has(patch.themeId) ? patch.themeId : undefined
      return updateProject(id, { ...patch, themeId })
    }
  )
```

  (When `themeId` is absent or unknown, this passes `themeId: undefined`, clearing any stored legacy value on the next settings write.)

- [ ] **Step 3: Widen the consumer callback signatures** so the renderer compiles against the new `string` `themeId`.

  In `src/renderer/src/components/ManageProjects.tsx`, change the `onSetTheme` prop type (line 8):

```ts
  onSetTheme: (id: string, themeId: string | undefined) => void
```

  In `src/renderer/src/components/EditProjectModal.tsx`, change the `onSetTheme` prop type (line 14):

```ts
  onSetTheme: (id: string, themeId: string | undefined) => void
```

  (Leave the rest of EditProjectModal — `THEME_OPTIONS`, the `'' | ThemeChoice` local state — untouched in T1; it is rewritten in T4. It still compiles because `ThemeChoice` is a subtype of `string`.)

  In `src/renderer/src/App.tsx`, change `setProjectTheme` (line 220):

```ts
  const setProjectTheme = useCallback(async (id: string, themeId: string | undefined) => {
    await window.api.updateProjectSettings(id, { themeId })
    await refreshProjects()
  }, [refreshProjects])
```

- [ ] **Step 4: Fix the App legacy resolution so the widened `themeId` typechecks.**

  App line 85 today is `const docTheme = resolveTheme(activeProject?.themeId ?? theme.document, systemDark)`. After Step 1, `activeProject?.themeId` is `string | undefined`, but the legacy `resolveTheme` expects `ThemeChoice` — this no longer compiles. Guard it to the legacy `ThemeChoice` set (this also pre-stages the "unknown id → use global" migration). Import `THEME_CHOICES` and replace lines 84–85:

```tsx
  const chromeTheme = resolveTheme(theme.chrome, systemDark)
  const projChoice = activeProject?.themeId
  const docChoice: ThemeChoice =
    projChoice && (THEME_CHOICES as readonly string[]).includes(projChoice)
      ? (projChoice as ThemeChoice)
      : theme.document
  const docTheme = resolveTheme(docChoice, systemDark)
```

  Update App's import (line 2) to pull `THEME_CHOICES` (a value, not a type):

```tsx
import type { Project, NavNode, SearchResult, ThemeChoice } from '@shared/types'
import { THEME_CHOICES } from '@shared/types'
```

- [ ] **Step 5: Widen two captured-theme annotations in `tests/editProjectModal.test.ts`** (moved here from T4 per MF1). These edits are independent of the T4 component rewrite, but T1's `onSetTheme` widening to `string | undefined` breaks `typecheck:web` without them — the `string | undefined` `themeId` is no longer assignable to the old `ThemeChoice`-typed capture arrays.

  In the `'does not emit a rename or theme update when nothing changed'` test (~line 117), change `const themes: Array<ThemeChoice | undefined> = []` to:

```ts
  const themes: Array<string | undefined> = []
```

  In `'maps the Global theme option to an undefined project theme'` (~line 135), change `const themes: Array<[string, ThemeChoice | undefined]> = []` to:

```ts
  const themes: Array<[string, string | undefined]> = []
```

  Then drop the now-unused `ThemeChoice` from the import on line 7 (else `noUnusedLocals` trips `typecheck:web`):

```ts
import type { Project } from '../src/shared/types'
```

  (Test *logic* — the `'dark'` seeds, the "nothing changed" expectation, and the new migration case — is corrected later in T4 Step 6 per MF2; T1 touches annotations + the import only.)

- [ ] **Step 6: Typecheck and run the existing theme-touching suite (full gate re-run).**

  Run: `bun run typecheck` — Expected: PASS (node + web). The Step-5 annotation widening in `tests/editProjectModal.test.ts` is what keeps `typecheck:web` green under the new `onSetTheme` signature.
  Run: `bun test tests/manageTypes.test.ts tests/editProjectModal.test.ts tests/manageProjects.test.ts` — Expected: PASS (string widening is back-compatible; the existing `'dark'` seeds still behave under the legacy-aware T1 App guard).

- [ ] **Step 7: Commit.**

```bash
git add src/shared/types.ts src/main/ipc.ts src/renderer/src/components/ManageProjects.tsx src/renderer/src/components/EditProjectModal.tsx src/renderer/src/App.tsx tests/editProjectModal.test.ts
git commit -m "refactor(theme): widen per-project themeId to a registry id string + validate in ipc"
```

---

## Task T2 — Theme model, registry, 4 presets, resolve/apply, migration (`lib/theme.ts` units)

*Adds the full new model under its FINAL names. The two names that collide with the still-live legacy API (`ThemeSettings`, `resolveTheme`) are resolved by **renaming the legacy exports to `Region*`** and mechanically updating their only consumers (App, Settings) — zero behavior change, project stays green. App + Settings migrate to the new model and the `Region*` legacy is deleted in T3.*

**Files:**
- Modify: `src/renderer/src/lib/theme.ts`
- Modify: `src/renderer/src/App.tsx` (mechanical legacy-name swap only)
- Modify: `src/renderer/src/components/Settings.tsx` (mechanical legacy-name swap only)
- Create: `tests/theme.test.ts`
- Modify: `tsconfig.web.json`, `tsconfig.node.json`

- [ ] **Step 1: Register the new test file.** In `tsconfig.web.json`, append `"tests/theme.test.ts"` to `"include"`. In `tsconfig.node.json`, append `"tests/theme.test.ts"` to `"exclude"`.

- [ ] **Step 2: Write the failing test** `tests/theme.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  resolveTheme, applyTheme, swatchColors,
  BUILTIN_THEMES, THEME_LIST, THEMEABLE_TOKENS, DEFAULT_THEME_ID, themeById,
  loadThemeSettings, saveThemeSettings,
  type Theme
} from '../src/renderer/src/lib/theme'
import { stubLocalStorage } from './helpers/localStorage'

let restoreLs: () => void
beforeEach(() => { restoreLs = stubLocalStorage() })
afterEach(() => { restoreLs() })

describe('resolveTheme', () => {
  it('base "system" follows systemDark', () => {
    const t: Theme = { id: 't', name: 'T', builtin: true, base: 'system', variants: { dark: {}, light: {} } }
    expect(resolveTheme(t, true, 'document').mode).toBe('dark')
    expect(resolveTheme(t, false, 'document').mode).toBe('light')
  })

  it('a pinned base ignores systemDark', () => {
    const t: Theme = { id: 't', name: 'T', builtin: true, base: 'light', variants: { light: { '--bg': '#fff' } } }
    expect(resolveTheme(t, true, 'document').mode).toBe('light')
    expect(resolveTheme(t, true, 'document').overrides['--bg']).toBe('#fff')
  })

  it('Default per-region base resolves chrome=dark, document=light from one theme', () => {
    const def = BUILTIN_THEMES[DEFAULT_THEME_ID]
    expect(resolveTheme(def, false, 'chrome').mode).toBe('dark')
    expect(resolveTheme(def, false, 'document').mode).toBe('light')
    expect(resolveTheme(def, true, 'document').mode).toBe('light') // pinned, not OS-following
  })

  it('missing variant falls back to the other variant, else {}', () => {
    const darkOnly: Theme = { id: 'd', name: 'D', builtin: true, base: 'dark', variants: { dark: { '--bg': '#000' } } }
    expect(resolveTheme(darkOnly, false, 'document').overrides['--bg']).toBe('#000') // resolves light → falls back to dark
    const empty: Theme = { id: 'e', name: 'E', builtin: true, base: 'dark', variants: {} }
    expect(resolveTheme(empty, false, 'document').overrides).toEqual({})
  })
})

describe('applyTheme', () => {
  it('sets data-theme and writes each override, clearing tokens the next theme omits', () => {
    const el = document.createElement('div')
    applyTheme(el, 'light', { '--bg': '#f4ecd8', '--accent': '#b5651d' })
    expect(el.getAttribute('data-theme')).toBe('light')
    expect(el.style.getPropertyValue('--bg')).toBe('#f4ecd8')
    expect(el.style.getPropertyValue('--accent')).toBe('#b5651d')

    applyTheme(el, 'dark', { '--bg': '#15171a' }) // no --accent this time
    expect(el.getAttribute('data-theme')).toBe('dark')
    expect(el.style.getPropertyValue('--bg')).toBe('#15171a')
    expect(el.style.getPropertyValue('--accent')).toBe('') // stale inline prop removed
  })

  it('ignores a non-whitelisted override key', () => {
    const el = document.createElement('div')
    applyTheme(el, 'dark', { '--not-a-theme-token': 'red' } as never)
    expect(el.style.getPropertyValue('--not-a-theme-token')).toBe('')
  })
})

describe('BUILTIN_THEMES registry', () => {
  it('exposes exactly the 4 presets in order', () => {
    expect(THEME_LIST.map((t) => t.id)).toEqual(['default', 'sepia', 'high-contrast', 'graphite'])
  })

  it('every preset override key is in THEMEABLE_TOKENS (whitelist invariant)', () => {
    const allowed = new Set<string>(THEMEABLE_TOKENS)
    for (const theme of THEME_LIST) {
      for (const variant of [theme.variants.dark, theme.variants.light]) {
        for (const key of Object.keys(variant ?? {})) expect(allowed.has(key)).toBe(true)
      }
    }
  })

  it('Default overrides nothing; Graphite keeps the cobalt accent (no --accent override)', () => {
    expect(BUILTIN_THEMES.default.variants).toEqual({ dark: {}, light: {} })
    const g = BUILTIN_THEMES.graphite.variants.dark ?? {}
    expect(g['--accent']).toBeUndefined()
    expect(g['--bg']).toBeDefined() // but it DOES shift the surface stack
  })

  it('themeById falls back to Default for an unknown id', () => {
    expect(themeById('nope').id).toBe(DEFAULT_THEME_ID)
    expect(themeById(undefined).id).toBe(DEFAULT_THEME_ID)
    expect(themeById('sepia').id).toBe('sepia')
  })
})

describe('swatchColors', () => {
  it('layers a theme override over the base palette for the swatch band', () => {
    // Sepia overrides --bg in light → swatch bg is the warm cream, not white.
    const sepia = BUILTIN_THEMES.sepia
    expect(swatchColors(sepia, 'light').bg).toBe(sepia.variants.light!['--bg'])
    // Default overrides nothing → swatch reads the base palette value.
    expect(swatchColors(BUILTIN_THEMES.default, 'dark').bg).toBe('#0a0f1e')
  })

  it("Default's light-half swatch equals the light base palette (BASE_SWATCH pin)", () => {
    // Default has no overrides, so the document (light) half must read the raw light base.
    expect(swatchColors(BUILTIN_THEMES.default, 'light')).toEqual({
      bg: '#ffffff', surface: '#eff3fb', surfaceAlt: '#e4ebf6', accent: '#1a7fe8', fg: '#14233a'
    })
  })
})

describe('loadThemeSettings migration', () => {
  it('returns Default for an absent store', () => {
    expect(loadThemeSettings()).toEqual({ themeId: DEFAULT_THEME_ID })
  })

  it('migrates a legacy { chrome, document } blob to Default', () => {
    localStorage.setItem('curator.theme', JSON.stringify({ chrome: 'dark', document: 'light' }))
    expect(loadThemeSettings()).toEqual({ themeId: DEFAULT_THEME_ID })
  })

  it('returns Default for an unknown themeId', () => {
    localStorage.setItem('curator.theme', JSON.stringify({ themeId: 'made-up' }))
    expect(loadThemeSettings()).toEqual({ themeId: DEFAULT_THEME_ID })
  })

  it('round-trips a valid themeId', () => {
    saveThemeSettings({ themeId: 'graphite' })
    expect(loadThemeSettings()).toEqual({ themeId: 'graphite' })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails.**

  Run: `bun test tests/theme.test.ts`
  Expected: FAIL (the new exports do not exist yet).

- [ ] **Step 4: Replace `src/renderer/src/lib/theme.ts`** with the new model PLUS the renamed-legacy block. (The 4 preset override sets are finalized here; hex values are contrast-checked against WCAG AA — High contrast targets AAA.)

```ts
// Curator theme model (Plan 5). A theme layers whitelisted CSS custom-property
// overrides over one of the two base `data-theme="dark|light"` palettes (styles.css).
// Applied imperatively by applyTheme (inline style props); resolved per region by
// resolveTheme. Persisted in localStorage['curator.theme'] as { themeId }, migrating
// the legacy { chrome, document } shape. See spec 2026-06-14-plan-5-theming-editor-design.md.
//
// The legacy two-region API is retained as Region* below ONLY until Plan 5 T3 migrates
// App + Settings to the new model, where it is deleted.

import type { ThemeChoice } from '@shared/types'
import { THEME_CHOICES } from '@shared/types'

export type { ThemeChoice }

// ── Model ─────────────────────────────────────────────────────────────────────
export type Mode = 'dark' | 'light'
export type CssVar = `--${string}`
export type TokenOverrides = Partial<Record<CssVar, string>>

// Per-region base when a theme differs across chrome/document (Default only);
// a plain Mode | 'system' applies uniformly to both regions.
export type ThemeBase =
  | Mode
  | 'system'
  | { chrome: Mode | 'system'; document: Mode | 'system' }

export interface Theme {
  id: string
  name: string
  builtin: boolean
  base: ThemeBase
  variants: { dark?: TokenOverrides; light?: TokenOverrides }
}

export interface ResolvedTokens {
  mode: Mode
  overrides: TokenOverrides
}

// Only palette/color tokens are themeable in v1. Structural tokens (spacing,
// radius, fonts, shadows, transitions) are NOT overridable. applyTheme + the
// authoring invariant in tests/theme.test.ts both gate on this list.
export const THEMEABLE_TOKENS: readonly CssVar[] = [
  '--bg', '--surface', '--surface-alt', '--surface-raised',
  '--fg', '--muted', '--faint',
  '--border', '--border-strong',
  '--accent', '--accent-hover', '--accent-active', '--accent-soft', '--accent-ring',
  '--highlight', '--highlight-soft',
  '--code-bg', '--code-fg', '--table-head',
  '--diagram-bg', '--diagram-ink', '--mark-bg',
  '--scrollbar-thumb', '--scrollbar-thumb-hover'
]

export const DEFAULT_THEME_ID = 'default'

// Resolve a theme for ONE region. Region only matters for Default's per-region base;
// every other preset resolves identically for 'chrome' and 'document'.
export function resolveTheme(
  theme: Theme,
  systemDark: boolean,
  region: 'chrome' | 'document'
): ResolvedTokens {
  const rawBase = typeof theme.base === 'object' ? theme.base[region] : theme.base
  const mode: Mode = rawBase === 'system' ? (systemDark ? 'dark' : 'light') : rawBase
  const overrides =
    theme.variants[mode] ?? theme.variants[mode === 'dark' ? 'light' : 'dark'] ?? {}
  return { mode, overrides }
}

// Apply to a region root: set the base data-theme, layer whitelisted overrides, and
// CLEAR any previously-applied override tokens this theme doesn't set (inline props
// would otherwise shadow the base set across a theme switch).
export function applyTheme(el: HTMLElement, mode: Mode, overrides: TokenOverrides): void {
  el.setAttribute('data-theme', mode)
  for (const token of THEMEABLE_TOKENS) {
    const value = overrides[token]
    if (value != null) el.style.setProperty(token, value)
    else el.style.removeProperty(token)
  }
}

// ── Builtin presets ────────────────────────────────────────────────────────────
// Coherent token groups per the spec §5. Default = pure passthrough (no overrides).
const SEPIA: TokenOverrides = {
  '--bg': '#f4ecd8', '--surface': '#efe6d0', '--surface-alt': '#e8dcc0', '--surface-raised': '#faf3e3',
  '--fg': '#433422', '--muted': '#7a6a52', '--faint': '#d6c6a8',
  '--border': '#ddcdaf', '--border-strong': '#c9b48f',
  '--accent': '#b5651d', '--accent-hover': '#c8762e', '--accent-active': '#8f4e16',
  '--accent-soft': 'rgb(181 101 29 / 12%)', '--accent-ring': 'rgb(181 101 29 / 35%)',
  '--highlight': '#b5651d', '--highlight-soft': 'rgb(181 101 29 / 16%)',
  '--code-bg': '#ece0c6', '--code-fg': '#4a3826', '--table-head': '#e8dcc0',
  '--diagram-bg': '#faf3e3', '--diagram-ink': '#433422', '--mark-bg': 'rgb(199 154 58 / 30%)',
  '--scrollbar-thumb': '#d6c6a8', '--scrollbar-thumb-hover': '#c9b48f'
}

const HC_DARK: TokenOverrides = {
  '--bg': '#000000', '--surface': '#0a0a0a', '--surface-alt': '#141414', '--surface-raised': '#1a1a1a',
  '--fg': '#ffffff', '--muted': '#cfcfcf', '--faint': '#3a3a3a',
  '--border': '#5a5a5a', '--border-strong': '#8a8a8a',
  '--accent': '#5ab0ff', '--accent-hover': '#8cc6ff', '--accent-active': '#2f95ff',
  '--accent-soft': 'rgb(90 176 255 / 22%)', '--accent-ring': 'rgb(90 176 255 / 70%)',
  '--highlight': '#ffd400', '--highlight-soft': 'rgb(255 212 0 / 22%)',
  '--code-bg': '#0a0a0a', '--code-fg': '#ffffff', '--table-head': '#141414',
  '--diagram-bg': '#000000', '--diagram-ink': '#ffffff', '--mark-bg': 'rgb(255 212 0 / 40%)',
  '--scrollbar-thumb': '#5a5a5a', '--scrollbar-thumb-hover': '#8a8a8a'
}

const HC_LIGHT: TokenOverrides = {
  '--bg': '#ffffff', '--surface': '#ffffff', '--surface-alt': '#f0f0f0', '--surface-raised': '#ffffff',
  '--fg': '#000000', '--muted': '#2e2e2e', '--faint': '#b0b0b0',
  '--border': '#6a6a6a', '--border-strong': '#2e2e2e',
  '--accent': '#0a52c0', '--accent-hover': '#0843a0', '--accent-active': '#063480',
  '--accent-soft': 'rgb(10 82 192 / 14%)', '--accent-ring': 'rgb(10 82 192 / 60%)',
  '--highlight': '#0a52c0', '--highlight-soft': 'rgb(10 82 192 / 16%)',
  '--code-bg': '#f0f0f0', '--code-fg': '#000000', '--table-head': '#e8e8e8',
  '--diagram-bg': '#ffffff', '--diagram-ink': '#000000', '--mark-bg': 'rgb(255 230 0 / 45%)',
  '--scrollbar-thumb': '#6a6a6a', '--scrollbar-thumb-hover': '#2e2e2e'
}

// Graphite: neutral charcoal surface stack, cobalt --accent* LEFT UNTOUCHED (D5-10).
const GRAPHITE_DARK: TokenOverrides = {
  '--bg': '#15171a', '--surface': '#1d2024', '--surface-alt': '#26292e', '--surface-raised': '#2f333a',
  '--fg': '#e8eaed', '--muted': '#8b9099', '--faint': '#2f333a',
  '--border': '#30343a', '--border-strong': '#3c4148',
  '--code-bg': '#1a1d21', '--code-fg': '#d4d7db', '--table-head': '#26292e',
  '--diagram-bg': '#1d2024', '--diagram-ink': '#e8eaed',
  '--scrollbar-thumb': '#30343a', '--scrollbar-thumb-hover': '#444a52'
}

export const BUILTIN_THEMES: Record<string, Theme> = {
  default: {
    id: 'default', name: 'Default', builtin: true,
    base: { chrome: 'dark', document: 'light' }, // pinned mixed look — no regression
    variants: { dark: {}, light: {} }
  },
  sepia: {
    id: 'sepia', name: 'Sepia', builtin: true,
    base: 'light', variants: { light: SEPIA }
  },
  'high-contrast': {
    id: 'high-contrast', name: 'High contrast', builtin: true,
    base: 'system', variants: { dark: HC_DARK, light: HC_LIGHT }
  },
  graphite: {
    id: 'graphite', name: 'Graphite', builtin: true,
    base: 'dark', variants: { dark: GRAPHITE_DARK }
  }
}

export const THEME_LIST: Theme[] = Object.values(BUILTIN_THEMES)

export function themeById(id: string | undefined): Theme {
  return (id && BUILTIN_THEMES[id]) || BUILTIN_THEMES[DEFAULT_THEME_ID]
}

// ── Token-faithful swatch colors (gallery card + per-project chip) ──────────────
// The base palette values for the few tokens a swatch band shows.
// PINNED to styles.css: these literals MUST mirror the `[data-theme="dark"]` /
// `[data-theme="light"]` token values in src/renderer/src/styles.css — they are the
// fallback the swatch reads when a theme overrides nothing. A future palette retune
// in styles.css must update this map in lockstep, or the swatches will lie.
// A theme override (if any) layers on top, so the swatch reads the theme's REAL
// resolved color (D5-9 token-faithful preview).
const BASE_SWATCH: Record<Mode, { bg: string; surface: string; surfaceAlt: string; accent: string; fg: string }> = {
  dark: { bg: '#0a0f1e', surface: '#111d28', surfaceAlt: '#1c2b3a', accent: '#4a9eff', fg: '#f0f4ff' },
  light: { bg: '#ffffff', surface: '#eff3fb', surfaceAlt: '#e4ebf6', accent: '#1a7fe8', fg: '#14233a' }
}

export interface SwatchColors { bg: string; surface: string; surfaceAlt: string; accent: string; fg: string }

// Resolve the swatch band colors for a theme at a given mode by layering its
// overrides over BASE_SWATCH. (Pass the mode you intend to show; for Default's
// split swatch render 'dark' for the chrome half and 'light' for the document half.)
export function swatchColors(theme: Theme, mode: Mode): SwatchColors {
  const base = BASE_SWATCH[mode]
  const ov = theme.variants[mode] ?? theme.variants[mode === 'dark' ? 'light' : 'dark'] ?? {}
  return {
    bg: ov['--bg'] ?? base.bg,
    surface: ov['--surface'] ?? base.surface,
    surfaceAlt: ov['--surface-alt'] ?? base.surfaceAlt,
    accent: ov['--accent'] ?? base.accent,
    fg: ov['--fg'] ?? base.fg
  }
}

// ── Global theme settings (localStorage 'curator.theme') ────────────────────────
export interface ThemeSettings {
  themeId: string
}

const STORAGE_KEY = 'curator.theme'
export const DEFAULT_THEME_SETTINGS: ThemeSettings = { themeId: DEFAULT_THEME_ID }

export function loadThemeSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_THEME_SETTINGS }
    const parsed = JSON.parse(raw) as { themeId?: unknown }
    if (typeof parsed?.themeId === 'string' && parsed.themeId in BUILTIN_THEMES) {
      return { themeId: parsed.themeId }
    }
    // Legacy { chrome, document } shape, unknown id, or malformed → Default (mixed look).
    return { ...DEFAULT_THEME_SETTINGS }
  } catch {
    return { ...DEFAULT_THEME_SETTINGS }
  }
}

export function saveThemeSettings(settings: ThemeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore quota/availability — theme is non-critical state */
  }
}

// ── Legacy two-region API (DELETED in Plan 5 T3 once App + Settings migrate) ─────
export type RegionMode = 'dark' | 'light'
export interface RegionThemeSettings {
  chrome: ThemeChoice
  document: ThemeChoice
}
export const DEFAULT_REGION_THEME: RegionThemeSettings = { chrome: 'dark', document: 'light' }
const CHOICES: readonly ThemeChoice[] = THEME_CHOICES
function isChoice(v: unknown): v is ThemeChoice {
  return typeof v === 'string' && (CHOICES as string[]).includes(v)
}
export function loadRegionTheme(): RegionThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_REGION_THEME
    const parsed = JSON.parse(raw) as Partial<RegionThemeSettings>
    return {
      chrome: isChoice(parsed.chrome) ? parsed.chrome : DEFAULT_REGION_THEME.chrome,
      document: isChoice(parsed.document) ? parsed.document : DEFAULT_REGION_THEME.document
    }
  } catch {
    return DEFAULT_REGION_THEME
  }
}
export function saveRegionTheme(settings: RegionThemeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}
export function resolveRegionMode(choice: ThemeChoice, systemDark: boolean): RegionMode {
  if (choice === 'system') return systemDark ? 'dark' : 'light'
  return choice
}
```

- [ ] **Step 5: Mechanically swap App + Settings onto the renamed legacy symbols (no behavior change).**

  In `src/renderer/src/App.tsx`, update the theme import (lines 13–18) and the call sites so they reference the renamed legacy API while the new API coexists:

```tsx
import {
  loadRegionTheme,
  saveRegionTheme,
  resolveRegionMode,
  type RegionThemeSettings
} from './lib/theme'
```

  Replace the legacy usages introduced/kept through T1:
  - `const [theme, setTheme] = useState<ThemeSettings>(loadThemeSettings)` → `useState<RegionThemeSettings>(loadRegionTheme)`
  - `useEffect(() => { saveThemeSettings(theme) }, [theme])` → `saveRegionTheme(theme)`
  - the two `resolveTheme(...)` calls in the `chromeTheme`/`docTheme` block (App lines 84–90 after T1) → `resolveRegionMode(...)`

  In `src/renderer/src/components/Settings.tsx`, update the import (line 2):

```ts
import type { ThemeChoice, RegionThemeSettings } from '../lib/theme'
```

  and change the `Props.settings` type and the `onChange` type from `ThemeSettings` to `RegionThemeSettings` (lines 5–6):

```ts
interface Props {
  settings: RegionThemeSettings
  onChange: (next: RegionThemeSettings) => void
  onClose: () => void
}
```

  (Settings's body is otherwise unchanged in T2 — still the two Segmented controls. It is replaced in T3.)

- [ ] **Step 6: Run the test to verify it passes.**

  Run: `bun test tests/theme.test.ts`
  Expected: PASS.

- [ ] **Step 7: Typecheck.**

  Run: `bun run typecheck`
  Expected: PASS (App + Settings compile against the renamed legacy API; the new model is unused-but-valid).

- [ ] **Step 8: Commit.**

```bash
git add src/renderer/src/lib/theme.ts src/renderer/src/App.tsx src/renderer/src/components/Settings.tsx tests/theme.test.ts tsconfig.web.json tsconfig.node.json
git commit -m "feat(theme): Theme model, BUILTIN_THEMES, resolve/apply + migration (legacy → Region*)"
```

---

## Task T3 — App imperative `applyTheme` + Settings theme gallery (prop-coupled, one commit)

*App's theme-state shape and Settings's props are coupled, so the App resolution rewrite and the Settings gallery land together. This task also DELETES the `Region*` legacy API (App + Settings were its only consumers).*

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/Settings.tsx`
- Modify: `src/renderer/src/lib/theme.ts` (delete the `Region*` block)
- Create: `tests/themeGallery.test.ts`
- Modify: `tsconfig.web.json`, `tsconfig.node.json`

- [ ] **Step 1: Register the new test file.** In `tsconfig.web.json`, append `"tests/themeGallery.test.ts"` to `"include"`; in `tsconfig.node.json`, append it to `"exclude"`.

- [ ] **Step 2: Write the failing test** `tests/themeGallery.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import Settings from '../src/renderer/src/components/Settings'
import { THEME_LIST, type ThemeSettings } from '../src/renderer/src/lib/theme'

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

function props(over: Partial<{ settings: ThemeSettings; onChange: (n: ThemeSettings) => void; onClose: () => void }> = {}) {
  return {
    settings: { themeId: 'default' } as ThemeSettings,
    onChange: () => {},
    onClose: () => {},
    ...over
  }
}
async function render(p: ReturnType<typeof props>): Promise<void> {
  await act(async () => { root.render(createElement(Settings, p)) })
}
const cards = (): HTMLElement[] => Array.from(container.querySelectorAll('[data-theme-card]'))

describe('Settings theme gallery', () => {
  it('renders one card per built-in theme inside a radiogroup', async () => {
    await render(props())
    expect(container.querySelector('[role="radiogroup"]')).toBeTruthy()
    expect(cards().length).toBe(THEME_LIST.length)
    expect(cards().map((c) => c.getAttribute('data-theme-id'))).toEqual(THEME_LIST.map((t) => t.id))
  })

  it('marks the card matching settings.themeId as selected', async () => {
    await render(props({ settings: { themeId: 'graphite' } }))
    const selected = container.querySelector('[data-theme-card][aria-checked="true"]') as HTMLElement
    expect(selected.getAttribute('data-theme-id')).toBe('graphite')
  })

  it('the Default card shows the split swatch and the "— mixed" label + tooltip', async () => {
    await render(props())
    const def = container.querySelector('[data-theme-card][data-theme-id="default"]') as HTMLElement
    expect(def.querySelector('[data-swatch-split]')).toBeTruthy()
    expect(def.textContent).toContain('Default — mixed')
    // The title={DEFAULT_TOOLTIP} sits on the card button itself (def), not a descendant.
    expect(def.getAttribute('title')).toContain('dark chrome')
  })

  it('commits on click and calls onChange with the clicked themeId', async () => {
    let next: ThemeSettings | null = null
    await render(props({ onChange: (n) => { next = n } }))
    const sepia = container.querySelector('[data-theme-card][data-theme-id="sepia"]') as HTMLElement
    await act(async () => { sepia.click() })
    expect(next).toEqual({ themeId: 'sepia' })
  })

  it('commits on Enter on a focused card', async () => {
    let next: ThemeSettings | null = null
    await render(props({ onChange: (n) => { next = n } }))
    const hc = container.querySelector('[data-theme-card][data-theme-id="high-contrast"]') as HTMLElement
    await act(async () => { hc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(next).toEqual({ themeId: 'high-contrast' })
  })

  it('commits on Space on a focused card', async () => {
    let next: ThemeSettings | null = null
    await render(props({ onChange: (n) => { next = n } }))
    const graphite = container.querySelector('[data-theme-card][data-theme-id="graphite"]') as HTMLElement
    await act(async () => { graphite.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true })) })
    expect(next).toEqual({ themeId: 'graphite' })
  })

  it('arrowing moves focus + the roving marker but does NOT commit (roving focus only, D5-13)', async () => {
    let calls = 0
    await render(props({ settings: { themeId: 'default' }, onChange: () => { calls++ } }))
    const first = cards()[0]
    await act(async () => { first.focus() })
    await act(async () => { first.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
    // No commit / no save on arrow — selection marker is roving-only.
    expect(calls).toBe(0)
    // aria-checked stays pinned to the COMMITTED theme, NOT the focused card.
    const checked = container.querySelector('[data-theme-card][aria-checked="true"]') as HTMLElement
    expect(checked.getAttribute('data-theme-id')).toBe('default')
    // Roving focus + tabIndex moved to the next card (the focused-but-uncommitted one).
    expect(cards()[1].getAttribute('tabindex')).toBe('0')
    expect(cards()[0].getAttribute('tabindex')).toBe('-1')
  })

  it('does NOT call onChange on hover/focus (swatch-only preview, D5-9)', async () => {
    let calls = 0
    await render(props({ onChange: () => { calls++ } }))
    const sepia = container.querySelector('[data-theme-card][data-theme-id="sepia"]') as HTMLElement
    await act(async () => { sepia.dispatchEvent(new window.Event('mousemove', { bubbles: true })) })
    await act(async () => { sepia.dispatchEvent(new window.Event('focus', { bubbles: true })) })
    expect(calls).toBe(0)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails.**

  Run: `bun test tests/themeGallery.test.ts`
  Expected: FAIL (Settings still renders the two Segmented controls; no `[data-theme-card]`).

- [ ] **Step 4: Rewrite `src/renderer/src/components/Settings.tsx`** as the gallery.

```tsx
import { useEffect, useRef, useState } from 'react'
import { THEME_LIST, swatchColors, type ThemeSettings, type Theme } from '../lib/theme'

interface Props {
  settings: ThemeSettings
  onChange: (next: ThemeSettings) => void
  onClose: () => void
}

const DESCRIPTORS: Record<string, string> = {
  default: 'Cobalt dark chrome, light document',
  sepia: 'Warm paper, easy on the eyes',
  'high-contrast': 'Maximum legibility',
  graphite: 'Neutral graphite surfaces'
}
const DEFAULT_TOOLTIP = 'Pinned: dark chrome with a light document — today’s default look'

// A token-faithful swatch band: contiguous bg → surface → surface-alt chips, a set-apart
// accent chip, and an "Aa" painted in --fg over --bg. Default renders a two-half split.
function Swatch({ theme }: { theme: Theme }): React.JSX.Element {
  if (theme.id === 'default') {
    const left = swatchColors(theme, 'dark') // chrome half
    const right = swatchColors(theme, 'light') // document half
    return (
      <div className="theme-swatch" data-swatch-split aria-hidden="true">
        <span className="theme-swatch-chip" style={{ background: left.bg }} />
        <span className="theme-swatch-chip" style={{ background: left.surface }} />
        <span className="theme-swatch-divider" />
        <span className="theme-swatch-chip" style={{ background: right.surface }} />
        <span className="theme-swatch-chip" style={{ background: right.bg }} />
        <span className="theme-swatch-accent" style={{ background: right.accent }} />
        <span className="theme-swatch-aa" style={{ color: right.fg, background: right.bg }}>Aa</span>
      </div>
    )
  }
  const c = swatchColors(theme, theme.base === 'light' ? 'light' : 'dark')
  return (
    <div className="theme-swatch" aria-hidden="true">
      <span className="theme-swatch-chip" style={{ background: c.bg }} />
      <span className="theme-swatch-chip" style={{ background: c.surface }} />
      <span className="theme-swatch-chip" style={{ background: c.surfaceAlt }} />
      <span className="theme-swatch-accent" style={{ background: c.accent }} />
      <span className="theme-swatch-aa" style={{ color: c.fg, background: c.bg }}>Aa</span>
    </div>
  )
}

export default function Settings({ settings, onChange, onClose }: Props): React.JSX.Element {
  const groupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const selectedIndex = Math.max(0, THEME_LIST.findIndex((t) => t.id === settings.themeId))
  // Roving focus index — moves on Arrow/Home/End WITHOUT committing. aria-checked stays
  // pinned to the committed (settings.themeId) card; the roving tabIndex=0 + .is-focused
  // marker move independently to the focused-but-uncommitted card (D5-13).
  const [focusIndex, setFocusIndex] = useState(selectedIndex)
  const commit = (id: string): void => onChange({ themeId: id })

  const moveFocus = (next: number): void => {
    setFocusIndex(next)
    const cards = groupRef.current?.querySelectorAll<HTMLElement>('[data-theme-card]')
    cards?.[next]?.focus()
  }

  // Roving radiogroup (D5-13): Arrow across the 2-col grid (wrapping) + Home/End move
  // FOCUS and the roving selection marker ONLY — they do NOT commit and do NOT save
  // (swatch-only preview, D5-9). Commit happens solely on click / Enter / Space.
  const onKeyDown = (e: React.KeyboardEvent, index: number): void => {
    const n = THEME_LIST.length
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(THEME_LIST[index].id); return }
    if (next >= 0) {
      e.preventDefault()
      moveFocus(next) // focus + roving marker only — NO commit on arrow
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Settings</h2>
          <button className="icon-button" onClick={onClose} title="Close" aria-label="Close">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </header>
        <div className="modal-body">
          <div className="section-label">Theme</div>
          <p className="section-hint">Applies to the whole app. Override per project in Manage Projects.</p>
          <div className="theme-gallery" role="radiogroup" aria-label="Theme" ref={groupRef}>
            {THEME_LIST.map((theme, index) => {
              const selected = theme.id === settings.themeId
              const label = theme.id === 'default' ? 'Default — mixed' : theme.name
              return (
                <button
                  key={theme.id}
                  type="button"
                  role="radio"
                  // aria-checked is pinned to the COMMITTED theme (settings.themeId), not
                  // the roving-focused card — arrowing never moves the checked state.
                  aria-checked={selected}
                  aria-label={`${theme.name} (${selected ? 'selected' : 'not selected'})`}
                  data-theme-card
                  data-theme-id={theme.id}
                  className={`theme-card${selected ? ' is-selected' : ''}${index === focusIndex ? ' is-focused' : ''}`}
                  tabIndex={index === focusIndex ? 0 : -1}
                  title={theme.id === 'default' ? DEFAULT_TOOLTIP : undefined}
                  onClick={() => commit(theme.id)}
                  onKeyDown={(e) => onKeyDown(e, index)}
                >
                  <Swatch theme={theme} />
                  <span className="theme-card-name">
                    {label}
                    {selected && <i className="fa-solid fa-check theme-card-check" aria-hidden="true" />}
                  </span>
                  <span className="theme-card-desc">{DESCRIPTORS[theme.id] ?? ''}</span>
                </button>
              )
            })}
          </div>
        </div>
        <footer className="modal-footer">
          <span>
            Created by{' '}
            <a href="https://borkweb.com" target="_blank" rel="noreferrer">Matthew Batchelder</a>
          </span>
          <a className="credit-gh" href="https://github.com/borkweb/curator" target="_blank" rel="noreferrer" title="github.com/borkweb/curator" aria-label="View curator on GitHub">
            <i className="fa-brands fa-github" aria-hidden="true" />
          </a>
        </footer>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Rewrite App's theme state + resolution to the new model.** Edit `src/renderer/src/App.tsx`.

  Update the theme import to the new model (replacing the `Region*` import from T2):

```tsx
import {
  loadThemeSettings,
  saveThemeSettings,
  resolveTheme,
  applyTheme,
  themeById,
  type ThemeSettings
} from './lib/theme'
```

  Drop the now-unneeded `THEME_CHOICES` value import and the `ThemeChoice` type import added in T1 (the migration now lives in `lib/theme.ts` + the IPC handler). App's first import line returns to:

```tsx
import type { Project, NavNode, SearchResult } from '@shared/types'
```

  Change the theme state + add the chrome ref (the `theme` state becomes `{ themeId }`):

```tsx
  const appShellRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<ThemeSettings>(loadThemeSettings)
```

  Keep the persistence effect (`useEffect(() => { saveThemeSettings(theme) }, [theme])`) — it now writes `{ themeId }`.

  **Remove** the legacy derivation block (the `chromeTheme`/`docChoice`/`docTheme` lines from T1/T2). **Replace** it with the resolution + an imperative apply effect, placed after `activeProject` is computed:

```tsx
  const effectiveThemeId = activeProject?.themeId ?? theme.themeId
  const resolvedTheme = themeById(effectiveThemeId)

  // Imperative apply: overrides are inline style props, so we write data-theme +
  // the --token overrides directly onto the chrome (.app-shell) and document (.content)
  // roots. Per-project theme drives BOTH regions (D5-5). Re-runs on theme/system change.
  // useLayoutEffect (NOT useEffect): the attributes/overrides must be written BEFORE first
  // paint, or the document pane flashes the dark :root base for one frame under the
  // light-document Default (launch-flash fix, MF4).
  useLayoutEffect(() => {
    const chrome = appShellRef.current
    const doc = mainRef.current
    if (chrome) {
      const r = resolveTheme(resolvedTheme, systemDark, 'chrome')
      applyTheme(chrome, r.mode, r.overrides)
    }
    if (doc) {
      const r = resolveTheme(resolvedTheme, systemDark, 'document')
      applyTheme(doc, r.mode, r.overrides)
    }
  }, [resolvedTheme, systemDark])
```

  **Confirm the React import pulls `useLayoutEffect`.** App's existing `import { … } from 'react'` line lists its hooks (`useState`, `useEffect`, `useRef`, `useCallback`, …); add `useLayoutEffect` to that list if not already present, so the theme-apply effect above resolves.

  (`resolvedTheme` is referentially stable for a given id because it comes from the `BUILTIN_THEMES` registry, so the effect re-runs only when `effectiveThemeId` or `systemDark` actually change.)

  **Remove the static `data-theme` attributes** so `applyTheme` is the single writer. Change the shell open tag (line 305) and the content `<main>` tag (line 330):

```tsx
    <div className="app-shell" ref={appShellRef}>
```

```tsx
        <main className="content" ref={mainRef}>
```

  The `<Settings settings={theme} onChange={setTheme} onClose={...} />` usage (line 409) is unchanged — `theme` is now `ThemeSettings` and Settings's new props match.

- [ ] **Step 6: Delete the `Region*` legacy block** from `src/renderer/src/lib/theme.ts` (everything under the `// ── Legacy two-region API …` comment: `RegionMode`, `RegionThemeSettings`, `DEFAULT_REGION_THEME`, `CHOICES`, `isChoice`, `loadRegionTheme`, `saveRegionTheme`, `resolveRegionMode`). Also drop the now-unused `THEME_CHOICES` value import if nothing else references it; keep `export type { ThemeChoice }` only if still imported elsewhere (it is not after T3 — remove the `ThemeChoice` import and re-export too).

  After deletion, the top of `lib/theme.ts` no longer needs the shared-types import:

```ts
// (no import from '@shared/types' — the new model is self-contained)
```

- [ ] **Step 7: Run the gallery test + the existing app-render tests (regression sweep).**

  Run: `bun test tests/themeGallery.test.ts` — Expected: PASS.
  Run: `bun test tests/theme.test.ts tests/sessionRestore.test.ts tests/appPalette.test.ts tests/appDeleteActive.test.ts` — Expected: PASS (theme rewrite did not regress the Plan-4 launch/palette/delete flows).

- [ ] **Step 8: Typecheck and build.**

  Run: `bun run typecheck` — Expected: PASS.
  Run: `bunx electron-vite build` — Expected: clean (Settings + App compile; no leftover `Region*` references).

- [ ] **Step 9: Manual smoke (commit body; not automated).** `bun run dev` → open Settings → the gallery shows 4 cards with token-faithful swatches; Default reads "Default — mixed" with a split swatch + tooltip; clicking Sepia recolors the whole app (chrome + document) warm; hovering other cards does NOT recolor; reopening keeps the chosen card selected after relaunch.

- [ ] **Step 10: Commit.**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/Settings.tsx src/renderer/src/lib/theme.ts tests/themeGallery.test.ts tsconfig.web.json tsconfig.node.json
git commit -m "feat(theme): imperative applyTheme on chrome+document + Settings theme gallery"
```

---

## Task T4 — EditProjectModal generalized `<select>` + token-faithful swatch chip

*Generalizes the per-project control to `{Use global}` + the theme list (D5-11), relabels it "Theme", and adds a small swatch chip beside the select. Updates the existing `tests/editProjectModal.test.ts` for the new option set.*

**Files:**
- Modify: `src/renderer/src/components/EditProjectModal.tsx`
- Modify: `src/renderer/src/components/ManageProjects.tsx` (thread optional `globalThemeId`)
- Modify: `src/renderer/src/App.tsx` (pass `globalThemeId={theme.themeId}`)
- Create: `tests/projectThemeSelect.test.ts`
- Modify: `tests/editProjectModal.test.ts`
- Modify: `tsconfig.web.json`, `tsconfig.node.json`

- [ ] **Step 1: Register the new test file.** In `tsconfig.web.json`, append `"tests/projectThemeSelect.test.ts"` to `"include"`; in `tsconfig.node.json`, append it to `"exclude"`.

- [ ] **Step 2: Write the failing test** `tests/projectThemeSelect.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import EditProjectModal, { type EditProjectModalProps } from '../src/renderer/src/components/EditProjectModal'
import { THEME_LIST } from '../src/renderer/src/lib/theme'
import type { Project } from '../src/shared/types'

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

const project: Project = {
  id: 'p1', type: 'local', name: 'Alpha', source: '/tmp/a',
  addedAt: 'now', status: 'ok', docCount: 3
} as Project

function props(over: Partial<EditProjectModalProps> = {}): EditProjectModalProps {
  return {
    project, onRename: () => {}, onSetTheme: () => {}, onSetDocsSubpath: async () => ({ docCount: 1 }),
    onClose: () => {}, ...over
  }
}
async function render(p: EditProjectModalProps): Promise<void> {
  await act(async () => { root.render(createElement(EditProjectModal, p)) })
}
const select = (): HTMLSelectElement => container.querySelector('[data-role="theme-select"]') as HTMLSelectElement
async function setSelect(v: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select(), v)
    select().dispatchEvent(new window.Event('change', { bubbles: true }))
  })
}

describe('EditProjectModal per-project theme control', () => {
  it('lists Use global + every built-in theme by name', async () => {
    await render(props())
    const labels = Array.from(select().querySelectorAll('option')).map((o) => o.textContent)
    expect(labels).toEqual(['Use global', ...THEME_LIST.map((t) => t.name)])
  })

  it('labels the field "Theme"', async () => {
    await render(props())
    const field = select().closest('.field') as HTMLElement
    expect(field.querySelector('span')?.textContent).toBe('Theme')
  })

  it('seeds an unknown legacy themeId as Use global', async () => {
    await render(props({ project: { ...project, themeId: 'dark' } as Project }))
    expect(select().value).toBe('') // legacy 'dark' is not a registry id → Use global
  })

  it('commits a chosen theme via onSetTheme on Save', async () => {
    const calls: Array<[string, string | undefined]> = []
    await render(props({ onSetTheme: (id, t) => calls.push([id, t]) }))
    await setSelect('graphite')
    await act(async () => { (container.querySelector('[data-action="save"]') as HTMLButtonElement).click() })
    expect(calls).toEqual([['p1', 'graphite']])
  })

  it('commits undefined when Use global is chosen', async () => {
    const calls: Array<[string, string | undefined]> = []
    await render(props({ project: { ...project, themeId: 'graphite' } as Project, onSetTheme: (id, t) => calls.push([id, t]) }))
    await setSelect('')
    await act(async () => { (container.querySelector('[data-action="save"]') as HTMLButtonElement).click() })
    expect(calls).toEqual([['p1', undefined]])
  })

  it('renders a swatch chip that repaints when the selection changes', async () => {
    await render(props())
    const chip = (): HTMLElement => container.querySelector('[data-theme-chip]') as HTMLElement
    expect(chip()).toBeTruthy()
    const before = chip().getAttribute('data-chip-theme')
    await setSelect('sepia')
    expect(chip().getAttribute('data-chip-theme')).toBe('sepia')
    expect(chip().getAttribute('data-chip-theme')).not.toBe(before)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails.**

  Run: `bun test tests/projectThemeSelect.test.ts`
  Expected: FAIL (the select still lists Global/Dark/Light/System; no swatch chip).

- [ ] **Step 4: Rewrite the theme control in `src/renderer/src/components/EditProjectModal.tsx`.**

  Replace the imports (lines 1–9):

```tsx
import { useState } from 'react'
import type { Project } from '@shared/types'
import { THEME_LIST, swatchColors, themeById, DEFAULT_THEME_ID } from '../lib/theme'

const THEME_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Use global' },
  ...THEME_LIST.map((t) => ({ value: t.id, label: t.name }))
]
```

  Add `globalThemeId` to the props interface (after `onSetTheme`):

```tsx
export interface EditProjectModalProps {
  project: Project
  onRename: (id: string, name: string) => void
  onSetTheme: (id: string, themeId: string | undefined) => void
  onSetDocsSubpath: (id: string, subpath: string) => Promise<{ docCount: number }>
  onClose: () => void
  globalThemeId?: string // for the "Use global" chip preview; defaults to Default
}
```

  Change the local theme state to a plain string and seed it only from a KNOWN id (legacy/unknown → `''` = use global). Replace line 28:

```tsx
  const isKnown = (id: string | undefined): boolean => !!id && THEME_OPTIONS.some((o) => o.value === id)
  const [theme, setTheme] = useState<string>(isKnown(project.themeId) ? (project.themeId as string) : '')
```

  Update the save mapping (lines 40–41):

```tsx
    const nextTheme = theme || undefined
    if (nextTheme !== project.themeId) props.onSetTheme(project.id, nextTheme)
```

  Replace the theme `<label className="field">` block (lines 96–108) with the select + chip. The chip resolves the selected theme (or the global theme when "Use global" is selected) and paints a small token-faithful band:

```tsx
          <label className="field">
            <span>Theme</span>
            <div className="theme-field-row">
              <select
                data-role="theme-select"
                value={theme}
                onChange={(event) => setTheme(event.target.value)}
                disabled={busy}
              >
                {THEME_OPTIONS.map((option) => (
                  <option key={option.value || 'global'} value={option.value}>{option.label}</option>
                ))}
              </select>
              {(() => {
                const chipId = theme || props.globalThemeId || DEFAULT_THEME_ID
                const c = swatchColors(themeById(chipId), themeById(chipId).base === 'light' ? 'light' : 'dark')
                return (
                  <span className="project-theme-chip" data-theme-chip data-chip-theme={chipId} aria-hidden="true">
                    <span className="project-theme-chip-band" style={{ background: c.bg }} />
                    <span className="project-theme-chip-band" style={{ background: c.surface }} />
                    <span className="project-theme-chip-band" style={{ background: c.accent }} />
                  </span>
                )
              })()}
            </div>
          </label>
```

- [ ] **Step 5: Thread `globalThemeId` through ManageProjects → EditProjectModal, and from App.**

  In `src/renderer/src/components/ManageProjects.tsx`, add the optional prop to `ManageProjectsProps` (after `onSetTheme`):

```ts
  globalThemeId?: string
```

  and pass it to the modal (in the `<EditProjectModal ... />` usage, lines 167–175):

```tsx
        <EditProjectModal
          project={editingProject}
          onRename={props.onRename}
          onSetTheme={props.onSetTheme}
          onSetDocsSubpath={props.onSetDocsSubpath}
          globalThemeId={props.globalThemeId}
          onClose={() => setEditId(null)}
        />
```

  In `src/renderer/src/App.tsx`, pass the global id to ManageProjects (the `<ManageProjects ... />` usage near line 333):

```tsx
              <ManageProjects
                projects={projects}
                onRename={renameProject}
                onSetTheme={setProjectTheme}
                onSetDocsSubpath={setProjectDocsSubpath}
                globalThemeId={theme.themeId}
                onDelete={deleteProject}
                onSelect={selectProject}
                onAddProject={() => setAddOpen(true)}
                onDone={() => setView('docs')}
              />
```

- [ ] **Step 6: Correct the existing `tests/editProjectModal.test.ts` for the generalized option set + the migration-on-save behavior (MF2).** The annotation widening (`ThemeChoice` → `string` on the two capture arrays) and the `ThemeChoice` import drop already landed in **T1 Step 5** — do NOT repeat them here. This step is logic/seed corrections only.

  Three existing cases interact with the generalized control:

  - `'seeds fields from the project and maps an absent theme to Global'` (line ~91): the assertion `expect($theme().value).toBe('')` still holds (absent → `''`) — no change.

  - `'does not emit a rename or theme update when nothing changed'` (line ~115): seeded `themeId: 'dark'` today, this now **FAILS** — `'dark'` is an unknown id, so the control seeds to `''`, `nextTheme` resolves to `undefined`, and the save guard `undefined !== 'dark'` is **true**, so it DOES emit `onSetTheme('local-1', undefined)` (the legacy-migration-on-save path) and `themes` becomes `[undefined]`, not `[]`. **Re-seed the project to a VALID built-in id** so genuinely nothing changes: change the seed to `themeId: 'sepia'`. Now the control seeds to `'sepia'`, Save with no edit yields `nextTheme === 'sepia' === project.themeId` → no emit → `expect(themes).toEqual([])` holds and the test truly asserts "no change → no emit".

  - `'maps the Global theme option to an undefined project theme'` (line ~134): unchanged in logic — seeded `'dark'` reads back as `''`, selecting `''` keeps `nextTheme` `undefined`, and `undefined !== 'dark'` fires `[['local-1', undefined]]`. Verify the assertion still reads `[['local-1', undefined]]`.

  **Add a new case** asserting the legacy-migration-on-save path explicitly (the behavior the re-seed above moved OUT of the "nothing changed" test):

```ts
  it('emits undefined on Save for a legacy themeId seed (migration on save)', async () => {
    const calls: Array<[string, string | undefined]> = []
    await render(props({ project: { ...project, themeId: 'dark' } as Project, onSetTheme: (id, t) => calls.push([id, t]) }))
    expect($theme().value).toBe('') // unknown legacy id seeds to Use global
    await act(async () => { (container.querySelector('[data-action="save"]') as HTMLButtonElement).click() })
    expect(calls).toEqual([['local-1', undefined]]) // stale 'dark' rewritten to undefined on save
  })
```

  (Match the `props`/`render`/`$theme` helper names, the `project` seed variable, and the project id already used in `tests/editProjectModal.test.ts`.)

- [ ] **Step 7: Run both per-project tests.**

  Run: `bun test tests/projectThemeSelect.test.ts tests/editProjectModal.test.ts`
  Expected: PASS.

- [ ] **Step 8: Typecheck and build.**

  Run: `bun run typecheck` — Expected: PASS.
  Run: `bunx electron-vite build` — Expected: clean.

- [ ] **Step 9: Commit.**

```bash
git add src/renderer/src/components/EditProjectModal.tsx src/renderer/src/components/ManageProjects.tsx src/renderer/src/App.tsx tests/projectThemeSelect.test.ts tests/editProjectModal.test.ts tsconfig.web.json tsconfig.node.json
git commit -m "feat(theme): per-project Use-global + theme-list select with token-faithful swatch chip"
```

---

## Task T5 — Gallery + swatch + chip styles (`styles.css`)

*CSS-only; verified by `bunx electron-vite build` + manual smoke. Built on existing tokens and the `.modal` / `.section-label` / `--accent-ring` vocabulary; no new card vocabulary, no gradients/glow.*

**Files:**
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: Widen the Settings modal and append the gallery/swatch/chip styles.** Append to `src/renderer/src/styles.css` (after the existing `.segmented` / Add-project blocks):

```css
/* ── Settings theme gallery (Plan 5) ─────────────────────────────────────── */
.settings-modal { width: min(520px, 92vw); }
.modal .section-hint { margin: 0; font-size: var(--text-sm); color: var(--muted); }

.theme-gallery {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3); }
.theme-card {
  display: flex; flex-direction: column; gap: var(--space-2);
  padding: var(--space-3); text-align: left; cursor: pointer;
  background: var(--surface); color: var(--fg);
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  transition: background var(--transition), border-color var(--transition), box-shadow var(--transition); }
.theme-card:hover { background: var(--surface-alt); border-color: var(--border-strong); }
.theme-card:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-ring); }
.theme-card.is-selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-ring); }
.theme-card-name {
  display: flex; align-items: center; gap: var(--space-2);
  font-size: var(--text-base); font-weight: var(--weight-medium); }
.theme-card.is-selected .theme-card-name { color: var(--accent); }
.theme-card-check { font-size: 12px; margin-left: auto; }
.theme-card-desc { font-size: var(--text-sm); color: var(--muted); }

.theme-swatch {
  display: flex; align-items: stretch; height: 40px; overflow: hidden;
  border: 1px solid var(--border); border-radius: var(--radius-sm); position: relative; }
.theme-swatch-chip { flex: 1 1 0; }
.theme-swatch-divider { width: 1px; background: var(--border-strong); flex: 0 0 auto; }
.theme-swatch-accent { flex: 0 0 18%; }
.theme-swatch-aa {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  font-size: 13px; font-weight: var(--weight-semibold); line-height: 1;
  padding: 1px 4px; border-radius: 2px; }

/* Per-project swatch chip beside the EditProjectModal theme select */
.theme-field-row { display: flex; align-items: center; gap: var(--space-2); }
.theme-field-row select { flex: 1 1 auto; }
.project-theme-chip {
  display: inline-flex; align-items: stretch; width: 28px; height: 16px; flex: 0 0 auto;
  overflow: hidden; border: 1px solid var(--border); border-radius: 2px; }
.project-theme-chip-band { flex: 1 1 0; }

@media (prefers-reduced-motion: reduce) { .theme-card { transition: none; } }
```

- [ ] **Step 2: Build to verify the CSS compiles.**

  Run: `bunx electron-vite build`
  Expected: clean (renderer bundles, CSS compiles).

- [ ] **Step 3: Manual smoke (commit body).** `bun run dev` → Settings gallery is a balanced 2×2 of cards; selected card shows the accent ring + check; Default's split swatch reads dark-left/light-right; EditProjectModal shows the select + a small swatch chip that repaints on selection change; `prefers-reduced-motion` removes card transitions but colors still update.

- [ ] **Step 4: Commit.**

```bash
git add src/renderer/src/styles.css
git commit -m "style(theme): .theme-gallery / .theme-card / .theme-swatch / .project-theme-chip"
```

---

## Final verification (after T5)

- [ ] Run the full theme suite: `bun test tests/theme.test.ts tests/themeGallery.test.ts tests/projectThemeSelect.test.ts tests/editProjectModal.test.ts tests/manageTypes.test.ts`
- [ ] Run the Plan-4 regression set: `bun test tests/sessionRestore.test.ts tests/appPalette.test.ts tests/appDeleteActive.test.ts tests/manageProjects.test.ts`
- [ ] `bun run typecheck` — PASS (node + web)
- [ ] `bunx electron-vite build` — clean
- [ ] Manual: switch global theme (Settings) → whole app recolors; set a per-project theme → both chrome + document recolor for that project; "Use global" clears it; relaunch restores the chosen theme; legacy `themeId: 'dark'` projects fall back to global Default with no error.

---

## Self-review notes (spec coverage)

- **D5-1/D5-2** (token-override map + by-id registry, `setProperty` over `data-theme`, whitelist, no injected `<style>`): T2 `BUILTIN_THEMES` + `THEMEABLE_TOKENS` + `applyTheme`. ✅
- **D5-3** (`themeId` → string + legacy migration): T1 (types/ipc), T2 (`loadThemeSettings` migration), IPC drop-unknown. ✅
- **D5-4 / D5-10** (4 presets; Graphite distinct-surface, cobalt accent retained): T2 presets + whitelist test asserting Graphite has no `--accent` override. ✅
- **D5-5** (per-project theme → both regions; calm transitions): T3 resolution uses `activeProject?.themeId` for both `applyTheme` calls. ✅
- **D5-6** (existing stores, no new IPC): localStorage `curator.theme` + `updateProjectSettings`. ✅
- **D5-7** (gallery replaces the two segmented controls): T3 Settings rewrite. ✅
- **D5-9 / D5-13** (swatch-only preview; roving-focus radiogroup): no transient apply; Arrow/Home/End move focus + a roving `tabIndex=0`/`.is-focused` marker only (no commit, no save), while `aria-checked` stays pinned to the committed theme — commit is click/Enter/Space only. Gallery test asserts hover/focus/arrow do not call `onChange` and `aria-checked` tracks the committed card. ✅
- **D5-14** (legacy `themeId` cleanup): write-time-only drop in the IPC handler; a lingering legacy value is inert (resolves to Default at runtime). Deferred closer = a one-shot versioned migration, only if the `ThemeChoice` enum is ever removed. No read-path normalization. ✅
- **MF4** (launch-flash): the App theme-apply effect uses `useLayoutEffect`, writing `data-theme` + token overrides before first paint so the document pane never flashes the dark `:root` base under light-document Default. ✅
- **D5-11** (per-project select + swatch chip): T4. ✅
- **D5-12** (Default one card, split swatch, "Default — mixed" + tooltip): T3 Settings `Swatch`/label/title; gallery test asserts split + label + tooltip. ✅
- **Optional per-project marker (D5-5, OPTIONAL):** not built — the whole-app recolor is the primary cue (spec flags it optional). Documented as out of this plan.
```
