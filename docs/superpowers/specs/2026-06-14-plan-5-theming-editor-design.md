# Plan 5 — Theming Editor (Design)

**Status:** Approved design, pending implementation plan.
**Parent spec:** `docs/superpowers/specs/2026-06-14-doc-viewer-design.md` (Theming section).
**Predecessors:** Plan 1 (core local viewer), Plan 2a/2b (GitHub backend + UI), Plan 3 (Manage Projects), **Plan 4 (session memory, command palette, file watch)**.
**Grounding ADR:** `docs/adr/0003-themes-are-app-side.md`.

## Goal

Give Curator a **curated theme library** so a user can change the whole app's look
(both chrome and document) with one choice, and assign a distinct theme **per
project** so they always know which project they're in. v1 ships a fixed set of
**built-in presets only** — no color editing — applied at runtime by layering
**token overrides** over the existing `data-theme` base palettes. This generalizes
the renderer's two-region `ThemeSettings` and the per-project `themeId` from the
narrow `ThemeChoice` enum (`dark`/`light`/`system`) into a registry of named themes
referenced by id, exactly as the parent spec's precedence rule (`project theme →
global theme → built-in fallback`) and CONTEXT.md's **Theme** glossary entry
describe.

It also replaces the two segmented controls in **Settings** (today: independent
Chrome and Document mode toggles) with a **theme gallery**, and generalizes the
per-project theme control in **Manage Projects** from `{Global / Dark / Light /
System}` to `{Use global} + the theme list`.

## Scope

**In scope**
- A **curated preset theme library** (D5-1/D5-2): 4 contrast-checked built-in
  themes, modeled as a **token-override map keyed by registry id**. No color
  editing, no custom themes, no background images in v1.
- Runtime application via **`element.style.setProperty('--token', value)`** layered
  over the existing `data-theme="dark|light"` base set on the chrome root
  (`.app-shell`) and the document root (`.content`). **No injected `<style>` tag, no
  new `[data-theme="<name>"]` CSS blocks.** Override token names are
  **registry-whitelisted**.
- **Per-project theme applies to BOTH chrome and document** (D5-5). Today the
  per-project override is document-only; App resolution gains project-aware chrome.
- Generalize `ProjectBase.themeId` from `ThemeChoice` to a **registry theme-id
  string** (D5-3), with explicit migration of persisted `'dark' | 'light' |
  'system'` values.
- **Settings theme gallery** replacing the two segmented controls (D5-7); one pick
  carries both regions + base/variant.
- Generalize the **Manage Projects** per-project control to `{Use global} + theme
  list`.
- Persist in the **existing stores** (D5-6): global theme-id in
  `localStorage['curator.theme']` (generalized `ThemeSettings`); per-project
  theme-id in the main registry via `updateProjectSettings`. **No new theme-CRUD
  IPC, no `userData/themes/`.**

**Out of scope (deferred)**
- **(b) Constrained customization** and **(c) full token editor + background
  images** (D5-1/D5-2) — deferred. Backgrounds, scrim/opacity/blur, and fonts stay
  out.
- **Custom-theme persistence:** `userData/themes/*.json`, `userData/themes/assets/`,
  and the `listThemes / saveTheme / deleteTheme / pickThemeImage` IPC named in the
  parent spec are **deferred with custom themes** (D5-6). v1 is built-in-only and
  persists in the existing stores. **No conflict with ADR-0003:** built-in presets
  are app-side config shipped in renderer source; the ADR's `userData/themes/`
  asset-copy boundary only becomes relevant once user-authored themes + images land.
- **Per-region "advanced override"** (independent chrome vs. document mode/theme) —
  a deferred fast-follow (D5-7). v1 picks one theme for both regions; the Default
  preset is the only theme that differs per region (to preserve today's look).
- **Customization fast-follow (D5-8, document-only):** base mode + accent picked
  from a curated design-system swatch + WCAG contrast validation. Full token editing
  and background images stay out even in that fast-follow.
- **Toolbar quick-switcher** — selection stays in Settings (global) + Manage
  Projects (per-project), per the parent spec. A command-palette "Theme…" entry is
  noted as a possible later add, not in v1.

**Design decisions encoded (resolved — not re-opened)**
- *D5-1/D5-2:* curated preset library as a **token-override map + by-id registry**,
  applied at runtime via `setProperty` over `data-theme`; whitelisted token names;
  no injected `<style>`; (b) and (c) deferred.
- *D5-3:* `themeId` widened to a registry theme-id string; legacy values migrated.
- *D5-4:* 4 built-in presets, contrast-checked: **Default**, **Sepia**,
  **High-contrast**, **Graphite** (distinct-surface).
- *D5-5:* per-project theme applies to both chrome and document; calm transitions
  via `--transition`; optional per-project marker (chip/rail).
- *D5-6:* built-in-only v1 persists in existing stores; no new theme-CRUD IPC.
- *D5-7:* a theme gallery replaces the two Settings segmented controls; per-region
  advanced override deferred.
- *D5-9:* **Live preview = swatch-only + commit-to-apply.** The gallery does **not**
  recolor the whole running app on hover/focus; the preview surface is the **card
  swatch**, which is **token-faithful** (rendered from the theme's real resolved token
  values). Only a click/Enter/Space **commits** and recolors the app.
- *D5-10:* the 4th preset is **Graphite** — a neutral **charcoal distinct-surface**
  palette that **retains the cobalt accent** (not Forest, not accent-only). It
  overrides the **bg / surface / surface-alt / border / ink** token groups and leaves
  the `--accent*` family cobalt.
- *D5-11:* the per-project theme control is a **`<select>`** (`Use global` + the theme
  list) **inside `EditProjectModal`**, plus a **small token-faithful swatch chip beside
  the selected option** — not a mini-gallery.
- *D5-12:* the **Default** theme is **one card** with a **split swatch**, labeled
  **"Default — mixed"** with a **tooltip** explaining its pinned mixed dark-chrome /
  light-document look.

## What already exists (reuse, don't reinvent)

- **Design system:** the `design-system` skill (Curator "Cobalt Reader" theme) +
  `styles.css` tokens. The full **dark** and **light** palette token sets already
  live under `:root, [data-theme="dark"]` and `[data-theme="light"]` (colors.css):
  `--bg --surface --surface-alt --surface-raised --fg --muted --border
  --border-strong --faint --accent --accent-hover --accent-active --accent-soft
  --accent-ring --highlight --highlight-soft --code-bg --code-fg --table-head
  --diagram-bg --diagram-ink --mark-bg` (plus `--scrollbar-*`, status colors,
  shadows). **These are exactly the override surface** — a theme overrides a coherent
  subset of them on top of one of the two base sets.
- **`.modal` / `.modal-overlay` / `.section-label`** (Settings, AddProjectModal) —
  the gallery reuses the Settings modal chrome and the `.section-label` header.
- **`.segmented`** — the vocabulary the gallery *replaces*; its selected-state
  treatment (`.active`, `--accent` text/border) informs the gallery card's selected
  state.
- **`.field` + `<select>`** (EditProjectModal "Document theme" select) — the
  per-project control already a `<select>`; v1 swaps its option set.
- **`data-chip` chip** (ManageProjects / CommandPalette) — the optional per-project
  theme marker reuses this chip vocabulary.
- **`resolveTheme(choice, systemDark)`** (`lib/theme.ts`) — generalized in place
  (same file, same localStorage key `curator.theme`, same fail-soft load/validate
  precedent).
- **App theme plumbing:** `chromeTheme` / `docTheme` resolution (App.tsx ~82–83),
  `data-theme` on `.app-shell` (~282) and `.content` (~307), the `systemDark`
  `matchMedia` listener (~63–79), and `setProjectTheme` (~214). These are the exact
  seams Plan 5 widens.
- **`tests/addProjectModal.test.ts`** jsdom harness (`react-dom/client` +
  `act`) — the template for the gallery and per-project-select renderer tests.

---

## Architecture

### 1. Theme data model (`lib/theme.ts`)

```ts
export type Mode = 'dark' | 'light'

// A CSS custom property name. Only registry-whitelisted vars may be overridden.
export type CssVar = `--${string}`
export type TokenOverrides = Partial<Record<CssVar, string>>

// Per-region base when a theme needs to differ across chrome/document (Default only);
// a plain Mode | 'system' applies uniformly to both regions.
export type ThemeBase =
  | Mode
  | 'system'
  | { chrome: Mode | 'system'; document: Mode | 'system' }

export interface Theme {
  id: string            // registry id, referenced by global + per-project settings
  name: string          // display label (gallery card, per-project select)
  builtin: boolean      // always true in v1
  base: ThemeBase       // which data-theme base set to sit on (per region or uniform)
  variants: {           // token overrides per resolved mode; empty = pure passthrough
    dark?: TokenOverrides
    light?: TokenOverrides
  }
}
```

- `base` selects which existing `data-theme` token set the overrides sit on.
  `'system'` follows the OS (`prefers-color-scheme`); a literal `'dark'`/`'light'`
  **pins** that appearance regardless of OS (mirrors how a single-variant theme
  pins, per the parent spec's hybrid rule). A per-region object is used **only** by
  **Default** so it can reproduce today's mixed dark-chrome / light-document look.
- `variants.dark` / `variants.light` hold the `TokenOverrides` applied when the
  resolved mode is dark / light. **Missing variant → fall back to the other variant,
  else `{}`** (pure passthrough to the base `data-theme` set). This is the
  "missing-variant" edge rule.
- **No `chrome`/`document` token split inside a theme** — a theme is one palette
  applied to both regions (D5-5). Region only affects the *mode* (via per-region
  `base`), not the override set. Per-region *theme* selection is the deferred
  advanced override.

### 2. Token whitelist (registry-enforced)

A theme may only override **palette/color** tokens. Structural tokens (spacing,
radius, fonts, shadows, transitions) are **not** themeable in v1.

```ts
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
```

`applyTheme` (below) ignores any override key not in this list, and the **registry
validates** every preset's overrides against it at module load (a dev-time
invariant; presets are authored in source, so this is a guard, not user input). The
same whitelist gates the **main-side `updateProjectSettings`** check: a `themeId`
that is not a known registry id is dropped to "use global."

### 3. The `BUILTIN_THEMES` registry

```ts
export const DEFAULT_THEME_ID = 'default'

export const BUILTIN_THEMES: Record<string, Theme> = {
  default:       { id: 'default',       name: 'Default',       builtin: true, base: {...}, variants: {...} },
  sepia:         { id: 'sepia',         name: 'Sepia',         builtin: true, base: 'light', variants: {...} },
  'high-contrast': { id: 'high-contrast', name: 'High contrast', builtin: true, base: 'system', variants: {...} },
  graphite:      { id: 'graphite',      name: 'Graphite',      builtin: true, base: 'dark',  variants: {...} }
}

export const THEME_LIST: Theme[] = Object.values(BUILTIN_THEMES) // gallery / select order
```

`DEFAULT_THEME` (the old `{ chrome, document }` constant) is **replaced** by a
generalized `ThemeSettings = { themeId: string }` whose default is
`{ themeId: DEFAULT_THEME_ID }`.

### 4. Generalized `resolveTheme` + `applyTheme`

```ts
export interface ResolvedTheme { mode: Mode; overrides: TokenOverrides }

// Resolve a theme for ONE region. Region only matters for Default's per-region base;
// every other preset resolves identically for 'chrome' and 'document'.
export function resolveTheme(
  theme: Theme,
  systemDark: boolean,
  region: 'chrome' | 'document'
): ResolvedTheme {
  const rawBase = typeof theme.base === 'object' ? theme.base[region] : theme.base
  const mode: Mode = rawBase === 'system' ? (systemDark ? 'dark' : 'light') : rawBase
  const overrides = theme.variants[mode] ?? theme.variants[mode === 'dark' ? 'light' : 'dark'] ?? {}
  return { mode, overrides }
}

// Apply to a region root: set the base data-theme, layer whitelisted overrides,
// and CLEAR any previously-applied override tokens this theme doesn't set.
export function applyTheme(el: HTMLElement, mode: Mode, overrides: TokenOverrides): void {
  el.setAttribute('data-theme', mode)
  for (const token of THEMEABLE_TOKENS) {
    const value = overrides[token]
    if (value != null) el.style.setProperty(token, value)
    else el.style.removeProperty(token)   // drop stale inline props when switching themes
  }
}
```

- **Signature note:** the parent task specified `resolveTheme(themeRef, systemDark)
  → { mode, overrides }`. It is extended with a `region` argument — the minimal
  generalization that preserves the specified `{ mode, overrides }` return shape
  while letting **Default** drive different modes for chrome vs. document. All other
  presets ignore `region` (their `base` is a single value).
- **`themeRef` resolution** happens in App (next section): a string id →
  `BUILTIN_THEMES[id] ?? BUILTIN_THEMES[DEFAULT_THEME_ID]` (unknown-id fallback).
  `resolveTheme` itself takes a resolved `Theme`, keeping it pure and unit-testable.
- **`applyTheme` clears, not just sets** — the load-bearing detail. Because overrides
  are inline `style` props, switching from a heavily-overriding theme (Sepia) to a
  light-touch one (Default) must `removeProperty` the tokens the new theme doesn't
  set, or stale inline values would shadow the base `data-theme` set.

### 5. The 4 presets — concept + overridden token groups

Hex values may reference the design system or be finalized in implementation; the
**set of overridden tokens per preset is fixed here**. Every preset is
**contrast-checked** (body text ≥ WCAG AA on its surface; accents legible).

#### Default — `base: { chrome: 'dark', document: 'light' }`, `variants: { dark: {}, light: {} }`

- **Concept (LOCKED, D5-12):** today's exact look — **dark cobalt chrome + light
  document** — carried by **one** theme so "nothing regresses" (D5-4/D5-7/D5-12).
  **Overrides: none** (both variants empty); it is pure passthrough to the existing
  `[data-theme="dark"]` / `[data-theme="light"]` base sets. The chrome resolves dark,
  the document resolves light, exactly as the old `DEFAULT_THEME = { chrome: 'dark',
  document: 'light' }` constant did.
- **Token groups overridden:** **none.** Default *is* the base.
- **Gallery presentation (D5-12):** Default ships as **one card** with a **split
  swatch** (dark-chrome half | light-document half), labeled **"Default — mixed"** with
  a **tooltip** (`title` / `aria-description`) explaining the pinned mixed look. The
  canonical registry `name` stays `Default` (used verbatim in the per-project select);
  the `— mixed` qualifier and tooltip are a **gallery-card affordance for Default only**.
  v1 **pins** the mixed look to guarantee no regression; per-region OS-following is the
  deferred advanced override (D5-7).

#### Sepia — `base: 'light'` (pinned warm; `variants: { light: {…} }` only)

- **Concept:** warm cream-paper reading surface with sepia ink — a calm long-read
  look. Pinned light (single variant) regardless of OS mode.
- **Token groups overridden (coherent groups):**
  - **bg/surface group** (together): `--bg --surface --surface-alt
    --surface-raised --code-bg --table-head --diagram-bg` → warm cream/tan.
  - **fg/ink group** (together): `--fg --muted --code-fg --diagram-ink` → warm
    brown/sepia.
  - **border group** (together): `--border --border-strong --faint` → warm tan.
  - **accent family** (full family together): `--accent --accent-hover
    --accent-active --accent-soft --accent-ring` → amber/terracotta, so links and the
    primary button read warm rather than cobalt.

#### High contrast — `base: 'system'` (`variants: { dark: {…}, light: {…} }`)

- **Concept:** maximal legibility / accessibility; follows the OS for dark vs. light
  but pushes contrast to the limits. Contrast explicitly validated.
- **Token groups overridden (both variants):**
  - **bg/surface group:** `--bg --surface --surface-alt --surface-raised --code-bg
    --table-head --diagram-bg` → pushed toward pure black (dark) / pure white (light).
  - **fg/ink group:** `--fg --muted --code-fg --diagram-ink` → pure-white / pure-black
    text; `--muted` darkened/lightened to clear AAA.
  - **border group:** `--border --border-strong --faint` → high-contrast hairlines.
  - **accent + focus group:** `--accent --accent-hover --accent-active --accent-soft
    --accent-ring` → a higher-contrast accent with a stronger focus ring.

#### Graphite — `base: 'dark'` (distinct-surface; `variants: { dark: {…} }` only)

- **Concept (LOCKED, D5-10):** the **distinct-surface** identity (D5-4/D5-10 — *not*
  Forest, *not* accent-only). Shifts the whole surface stack off cobalt-blue toward
  **neutral charcoal/graphite**, keeping the cobalt accent as the single pop of color so
  it reads as a clearly different app skin. Pinned dark. **Overridden token groups are
  fixed:** **bg/surface group**, **surface-alt** (part of that group), **border group**,
  and the **ink-on-graphite** tokens — with the **`--accent*` family left cobalt**.
- **Token groups overridden (coherent groups):**
  - **bg/surface group** (the defining move, together): `--bg --surface --surface-alt
    --surface-raised --code-bg --table-head --diagram-bg` → neutral graphite grays
    (e.g. `#15171a → #1d2024 → #26292e → #2f333a`).
  - **border group** (together): `--border --border-strong --faint` → neutral gray.
  - **ink-on-graphite:** `--diagram-ink --code-fg` → neutral light gray to match the
    new surfaces.
  - **accent family: left untouched** — cobalt `--accent*` stays, intentionally, as
    the recognizable highlight against the neutral field.

#### Swatch recognition at card size (per D5-4: read the surface, not the accent)

Each preset must be distinguishable in the ~200×40px swatch band **before** the name
is read. Validated:

| Preset | Swatch reads as | Distinct from neighbors by |
|--------|-----------------|----------------------------|
| **Default** | split band — **dark** cobalt-black/slate left, **white/cobalt-gray** right, hairline divider | the only **two-tone** swatch; signals the mixed look |
| **Sepia** | warm **cream → tan** chips, amber accent chip, brown "Aa" | the only **warm-hued** band — unmistakable beside three cool/neutral ones |
| **High contrast** | near-**pure black or pure white** chips (per OS mode), bold accent, max-contrast "Aa" | extreme value range — chips read as black/white, not slate |
| **Graphite** | neutral **charcoal → graphite** grays, **cobalt** accent chip retained | neutral (no blue cast) surface vs Default's cobalt-tinted dark; the retained cobalt accent confirms it's a sibling skin, not Sepia |

The two cool-dark presets (Default-dark-half, Graphite) are the closest pair; they
separate on **hue** (cobalt-tinted vs neutral-gray surface) and on Default being
two-tone. If that pairing proves too subtle at card size in implementation, nudge
Graphite's surfaces a half-step cooler-neutral — never lean on the accent to
differentiate (that would violate D5-4).

### 6. Application + per-project resolution precedence

**Resolution (App.tsx), precedence `project theme → global theme → Default`:**

```ts
const globalThemeId = themeSettings.themeId               // generalized ThemeSettings
const effectiveId = activeProject?.themeId ?? globalThemeId ?? DEFAULT_THEME_ID
const theme = BUILTIN_THEMES[effectiveId] ?? BUILTIN_THEMES[DEFAULT_THEME_ID]  // unknown-id → Default
const chromeRes = resolveTheme(theme, systemDark, 'chrome')
const docRes    = resolveTheme(theme, systemDark, 'document')
```

- **Both regions use the same theme** (D5-5). Default yields chrome=dark /
  document=light (its per-region base); every other preset yields the same mode +
  overrides for both regions (uniform, whole-app distinction).
- **Application is imperative**, because overrides are inline styles. App holds a ref
  to the chrome root (`.app-shell`) and reuses the existing `mainRef` for the document
  root (`.content`). An effect keyed on `[effectiveId, systemDark]` calls:
  ```ts
  applyTheme(appShellRef.current, chromeRes.mode, chromeRes.overrides)
  applyTheme(mainRef.current,     docRes.mode,    docRes.overrides)
  ```
  The static `data-theme={chromeTheme}` / `data-theme={docTheme}` JSX attributes
  (App.tsx ~282 / ~307) are **removed** — `applyTheme` now owns `data-theme` so the
  attribute and the inline overrides are always written together from one place.
- **Calm transitions (D5-5):** theme swaps are presentation-only and instant; existing
  token-driven `--transition` color transitions carry the change. **Never a rebuild**
  (themes don't touch discovery/indexing), consistent with the parent spec.
- **Optional per-project marker (D5-5, mark OPTIONAL):** a small `data-chip` rail/chip
  near the project name in the top bar / status bar, tinted from the active theme's
  `--accent`, as a recognition aid. **Flagged optional** — include only if it reads as
  signal, not decoration; the whole-app recolor is already the primary cue.

### 7. Migration of old `themeId` values (D5-3)

Two persisted surfaces carry legacy theme values:

**(a) Per-project `themeId` (main registry):** existing values are `'dark' |
'light' | 'system'`. The **cleanest migration is: treat any persisted `themeId`
that is not a known registry id as "use global" (drop it → `themeId` absent).**
Because none of `'dark'/'light'/'system'` is a `BUILTIN_THEMES` id, all three
collapse to "use global." This falls directly out of the **unknown-id validation**
in `updateProjectSettings` / registry read — no bespoke mapping table. Rationale:
the legacy per-project override was **document-pane-only** under a two-region model
that no longer exists; rather than mint pinned-mode built-ins solely to preserve a
rarely-used override, a legacy-themed project simply follows the (mixed) global
Default. `'system'` correctly disappears as a `themeId` value and becomes a property
of the Default theme, exactly as D5-3 requires.
- *Considered + rejected:* mapping `'dark' → graphite` / `'light' → sepia` (preserve a
  pin). Rejected — those presets carry strong identities the user never opted into;
  silently assigning them is more surprising than "follow global."

**(b) Global `localStorage['curator.theme']` (renderer):** old shape `{ chrome,
document }`. `loadThemeSettings` is rewritten to read `{ themeId }`; if the parsed
value lacks a known `themeId` (i.e. it is the old `{chrome,document}` shape, or
malformed/absent), it returns `{ themeId: DEFAULT_THEME_ID }`. All legacy
chrome/document combinations collapse to **Default**, which reproduces the default
mixed look. Custom per-region combos are not preserved (the per-region advanced
override is deferred); this is acceptable and surfaced as a residual ambiguity.

### 8. The invasive piece (isolate + re-run gates)

Widening `themeId` from `ThemeChoice` to a registry **string** is the invasive change
(D5-3) — it ripples across the type boundary and the IPC handler:

- `src/shared/types.ts`: `ProjectBase.themeId?: string`; the
  `updateProjectSettings(id, patch)` param's `themeId?: ThemeChoice` → `themeId?:
  string`. (`ThemeChoice` / `THEME_CHOICES` remain only if still referenced; the
  per-region mode vocabulary is now internal to `lib/theme.ts` as `Mode`.)
- `src/main/ipc.ts`: the `updateProjectSettings` / `projects:update` handler accepts
  the string `themeId` and **validates it against the registry id set** (unknown →
  drop to "use global"). The registry stores it verbatim.
- `src/renderer/src/App.tsx`: `setProjectTheme(id, themeId?: string)`; the resolution
  block (§6); imperative `applyTheme`.
- `src/renderer/src/components/EditProjectModal.tsx`: the option set generalizes
  (§ Manage Projects select).

This is a small, self-contained surface; **isolate it in its own commit and re-run
the full gate set** (typecheck + bun tests) after the type widening lands, before the
gallery UI.

---

## UI design detail

### Settings — the theme gallery (replaces the two segmented controls)

The Settings modal's **Theme** section drops the two `setting-row` segmented controls
(Chrome / Document) and renders a **single gallery**: the user picks **one** theme
that carries both regions and its base/variant. The chosen theme is the **global**
theme; per-project overrides are set in Manage Projects.

**Layout — a card gallery inside the existing `.modal`:**

```
┌─ Settings ──────────────────────────────────────── ✕ ─┐
│  Theme                                                 │  ← .section-label
│  Applies to the whole app. Override per project        │  ← .section-hint (muted)
│  in Manage Projects.                                   │
│                                                        │
│  ┌──────────────────────┐ ┌──────────────────────┐    │
│  │ ████▏░░░░  Aa         │ │ ▓▓▓▒▒▒░░░  Aa         │    │ ← swatch: bg│surface│
│  │                      │ │                      │    │   surface-alt + accent
│  │ Default            ✓ │ │ Sepia                │    │   tick, "Aa" in --fg
│  │ Cobalt dark + light  │ │ Warm paper, easy…    │    │ ← name + descriptor
│  └━━━━━━━━━━━━━━━━━━━━━━┘ └──────────────────────┘    │   (selected = accent ring)
│  ┌──────────────────────┐ ┌──────────────────────┐    │
│  │ ██▏░░  ▕██▏░░  Aa     │ │ ▓▓▓▒▒░░░  Aa          │    │
│  │                      │ │                      │    │
│  │ High contrast        │ │ Graphite             │    │
│  │ Maximum legibility   │ │ Neutral graphite…    │    │
│  └──────────────────────┘ └──────────────────────┘    │
└────────────────────────────────────────────────────────┘
```

- **Fixed 2×2 grid** (`repeat(auto-fill, minmax(200px, 1fr))`, `gap: var(--space-3)`)
  inside the modal body. v1 has exactly **4** presets, so the grid is balanced 2×2 and
  reflows to a single column under ~440px; `auto-fill` keeps it correct if a 5th preset
  ever lands. The modal **widens** from today's `440px` to `width: min(520px, 92vw)` to
  hold two ~220px columns with comfortable gutters. (Earlier draft said "4 in a row /
  560px" — corrected: a 4-wide row forces an unbalanced, over-wide modal for a fixed
  set of four.)
- **Swatch preview** per card: a horizontal band rendered **from the theme's own
  resolved tokens** — contiguous chips for `--bg → --surface → --surface-alt`, a single
  `--accent` chip set apart, and an "Aa" glyph painted in `--fg` over `--bg`. This is
  the **recognition surface**: per D5-4 the eye reads the *background/surface* shift,
  not the accent, so the bg/surface chips dominate the band width and the accent is a
  small accent — never the whole swatch. Swatch height ~40px; it must read at card size
  without a thumbnail.
- **Default's split swatch:** Default alone renders a **two-half** band — left half
  shows its dark chrome chips, right half its light document chips, divided by a hairline
  — to telegraph the mixed dark-chrome / light-document look its per-region `base`
  produces. The "Aa" sits on the light (document) half.
- **Card body:** theme `name` (in `--fg`, `--weight-medium`) + a one-line `--muted`
  descriptor. Two lines; never wraps past two.
- **Selected state:** the committed card carries an `--accent` ring
  (`box-shadow: 0 0 0 2px var(--accent-ring)`) + a small `fa-check` in `--accent` at the
  name row, mirroring `.segmented .active` / `.tree-item.active` (accent text + soft
  fill). Exactly **one** card is selected at any time.
- **Hover / focus (idle, non-committing):** a card lifts to `--surface-alt` with a
  `--border-strong` edge — the standard `.tree-item:hover` affordance. This is a
  **pointer/focus affordance only**: it does **not** recolor the running app (D5-9).

**Interaction states & live preview (LOCKED — swatch-only + commit-to-apply, D5-9)**

The gallery **does not recolor the whole running app on hover/focus.** The preview
surface is the **card swatch itself** — token-faithful (rendered from each theme's real
resolved token values), so the user reads the actual palette without any transient
whole-app repaint. Only a **commit** (click / `Enter` / `Space`) recolors the app.

| State | Trigger | Behavior |
|-------|---------|----------|
| **Default** | open Settings | the card matching `themeSettings.themeId` is selected (accent ring + check); it also holds initial keyboard focus (roving tabindex). |
| **Hover / focus** | pointer over / `Tab` to a card | card shows the idle hover/focus affordance (above). **No whole-app recolor** — the token-faithful swatch already shows the real palette. |
| **Selecting (commit)** | click, `Enter`, or `Space` on a card | `saveThemeSettings({ themeId })` → App resolution effect re-applies to `.app-shell` + `.content`. The selected ring moves to the committed card. This is the **only** path that recolors the app. |
| **Escape** | `Esc` closes Settings | the existing Settings handler closes the modal. There is **no uncommitted preview to revert** — nothing was applied on hover. |

- **No transient `effectiveId`.** Because preview is swatch-only, App never drives a
  hover/focus preview through `applyTheme`; the commit path is the single entry point,
  so a swatch and the committed result are painted from the **same** resolved tokens and
  match exactly. (Whole-app hover preview was considered and **rejected** for v1: the
  modal covers most of the app so only edges would recolor, and rapid hover across the
  2×2 grid would flicker — D5-9.)
- **Motion:** theme swaps are a **color cross-fade only**, carried by the existing
  token `--transition` (120ms) / `--transition-slow` (220ms) on color properties —
  cap the theme transition at **≤200ms**, no layout/transform animation. Card entrance
  (if any) uses `--transition-slow`. **`prefers-reduced-motion: reduce` → instant**:
  no cross-fade, no entrance; the swatch and committed state still update (color is
  information, not decoration — only the *animation* is suppressed). This replaces the
  prior garbled note that conflated reduced-motion with disabling preview.
- **Keyboard & focus:** the gallery is `role="radiogroup"` (`aria-label="Theme"`);
  cards are `role="radio"` with **roving tabindex** (only the selected card is in the
  tab order). Arrow keys move selection-focus across the grid (Left/Right within a row,
  Up/Down across rows, **wrapping**); `Home`/`End` jump to first/last; `Enter`/`Space`
  commit; focus ring via `--accent-ring` (`:focus-visible`, reusing the
  `.segmented button:focus-visible` 3px ring). Focusing a card moves the roving
  selection-focus and shows the idle focus affordance only — it does **not** recolor the
  app (swatch-only preview, D5-9). On close, focus returns to the Settings trigger.

**Verbatim copy (Settings):**

| Element | Copy |
|---------|------|
| Section label | `Theme` |
| Section hint | `Applies to the whole app. Override per project in Manage Projects.` |
| Card — Default | label `Default — mixed` · descriptor `Cobalt dark chrome, light document` · tooltip `Pinned: dark chrome with a light document — today's default look` |
| Card — Sepia | `Sepia` · descriptor `Warm paper, easy on the eyes` |
| Card — High contrast | `High contrast` · descriptor `Maximum legibility` |
| Card — Graphite | `Graphite` · descriptor `Neutral graphite surfaces` |
| Selected aria | `{name} (selected)` |
| Live-preview affordance | **none** — preview is **swatch-only** (D5-9): the token-faithful card swatch is the preview; hover/focus never recolors the app. No "Previewing…" toast/label and no per-card "Apply" button. Only a commit recolors. |

Sentence case throughout; no "skin" / "style" / marketing verbs. Descriptors are a
single clause, ≤ ~28 chars so they don't wrap past one line in the card.

### Accessibility & touch targets

- **Semantics:** `radiogroup` / `radio` (single-select, exactly one active) is the
  correct mapping — not `listbox`/`option` (which implies a popup) and not a set of
  independent checkboxes. Screen readers announce "Theme, radio group" then
  "{name}, radio, selected, n of 4".
- **Contrast (AA target):** every preset is validated so **body text ≥ WCAG AA (4.5:1)**
  on its surfaces and **UI text / accents ≥ 3:1**; **High contrast** targets **AAA
  (7:1)**. The swatch is decorative (the name carries meaning), so the swatch itself
  needs no contrast guarantee, but the **"Aa" sample must clear AA on its chip** so the
  preview doesn't misrepresent legibility. Validation is a build/authoring invariant
  (presets are source), surfaced in `tests/theme.test.ts` as a documented check list.
- **Targets:** each card is the hit target (full card clickable), comfortably ≥ **44×44px**
  on desktop; the swatch + two text lines already exceed this. The per-project
  `<select>` keeps the native control's accessible target.
- **Focus management:** roving tabindex (above); focus ring never suppressed without a
  visible `:focus-visible` replacement; on commit, focus stays on the chosen card; on
  modal close, focus returns to the Settings trigger button.

### Manage Projects — generalized per-project select

The per-project theme control (today in `EditProjectModal`, a `<select>` with
`{Global / Dark / Light / System}`) generalizes to **`{Use global}` + the theme
list**:

```tsx
const THEME_OPTIONS = [
  { value: '', label: 'Use global' },
  ...THEME_LIST.map(t => ({ value: t.id, label: t.name }))
]
```

- `value: ''` → `themeId` undefined (clears the override → use global). Any other
  value sets that registry id.
- The field label changes from **"Document theme"** to **"Theme"** (it now governs the
  whole app for that project, chrome + document — D5-5).
- **Swatch chip beside the selected option (LOCKED, D5-11):** a **small token-faithful
  swatch chip** sits **next to the `<select>`**, painted from the currently-selected
  theme's real resolved tokens (a compact horizontal bg/surface/accent band, the same
  recognition surface as the gallery swatch, at chip scale ~`28×16px`). When `Use
  global` is selected the chip renders the **global theme's** swatch (so the user sees
  what "use global" resolves to). The chip updates the instant the select changes. It is
  a recognition aid only — **not** a mini-gallery, **not** clickable, and it does **not**
  recolor the app (commit happens on Save → `updateProjectSettings`).
- Commit path is unchanged: `onSetTheme(project.id, themeId | undefined)` →
  `updateProjectSettings(id, { themeId })` → `refreshProjects()`. When the edited
  project is active, the resolution effect re-applies instantly.
- **Verbatim copy:** field label `Theme`; the "use global" option `Use global`; each
  built-in by `name`.
- **Form — select + swatch chip, not a mini-gallery (LOCKED, D5-11):** the per-project
  control stays a plain `.field` `<select>` paired with the swatch chip, *not* a second
  copy of the gallery. Rationale: (1) the EditProjectModal is a **dense, multi-field
  form** (Name, Theme, Docs subpath) where a card grid would dominate and unbalance it —
  per D3-3, row density already won over a wide segmented control; (2) the global gallery
  is the place to *browse* themes; the per-project control is a quick *assignment* of an
  already-known theme; a select is the right altitude for assignment. The swatch chip
  restores a **token-faithful preview of the selected theme** without the cost of a card
  grid — the recognition aid the bare select lacked.
- **Vocabulary parity with the gallery:** options use the **same display `name`s** as
  the gallery cards (`Default`, `Sepia`, `High contrast`, `Graphite`), and the
  null/inherit option reads **`Use global`** — matching the gallery's "Applies to the
  whole app. Override per project…" framing so the two surfaces speak one language. The
  legacy `{Global / Dark / Light / System}` vocabulary is fully retired.

### AI-slop guardrails

What keeps this from a generic "pick a skin" panel: swatches rendered from the
**actual theme tokens** (not stock thumbnails); cards built on the existing
`.modal` + `--accent-ring` selected treatment (no new card vocabulary, no hero, no
gradient, no glow on chrome); the per-project control stays a plain `.field`
`<select>`; presets are **few and opinionated** (4 coherent identities, not a
rainbow); copy is terse sentence-case canonical vocabulary ("Theme", "Use global",
never "skin"/"style"). One interactive accent throughout.

---

## Data flow

```
Settings gallery (renderer)
  hover card  → swatch-only (D5-9): NO whole-app apply; the token-faithful swatch
                  is the preview. Hover/focus only moves the roving selection.
  click card  → saveThemeSettings({ themeId }) → setThemeSettings → resolution effect
                  → applyTheme(.app-shell, …) + applyTheme(.content, …)

Manage Projects → EditProjectModal select + swatch chip
  pick theme  → swatch chip repaints from the selected theme's tokens (no app recolor)
  save        → onSetTheme(id, themeId|undefined)
                  → window.api.updateProjectSettings(id, { themeId })
                      → ipc.ts validates themeId ∈ registry (else drop) → registry.updateProject
                  → refreshProjects() → if id === activeId, resolution effect re-applies

App resolution effect  (deps: effectiveId, systemDark)
  effectiveId = activeProject?.themeId ?? globalThemeId ?? DEFAULT_THEME_ID
  theme       = BUILTIN_THEMES[effectiveId] ?? Default
  applyTheme(appShellRef, resolveTheme(theme, systemDark, 'chrome'))
  applyTheme(mainRef,     resolveTheme(theme, systemDark, 'document'))
```

## Error & edge handling

- **Unknown theme-id** (global or per-project, e.g. a future-version id read back on
  downgrade) → resolve to **Default** (`BUILTIN_THEMES[id] ?? Default`); no crash, no
  surfaced error. The per-project value is additionally normalized to "use global" at
  the IPC validation boundary.
- **Missing variant** (theme defines only `dark` but resolves `light`, or vice
  versa) → `resolveTheme` falls back to the other variant, else `{}` (pure passthrough
  to the base `data-theme` set). A pinned theme (single variant) thus always renders.
- **Stale inline overrides on theme switch** → `applyTheme` `removeProperty`s every
  whitelisted token the new theme doesn't set, so no override leaks across a switch.
- **Hover/focus never recolors the app** (D5-9) → preview is swatch-only, so leaving a
  card or closing Settings has nothing to revert; the app stays on the committed
  `themeId` until a card is explicitly committed.
- **localStorage unavailable / malformed** → `loadThemeSettings` returns `{ themeId:
  DEFAULT_THEME_ID }` (fail-soft, same precedent as today).
- **No active project** → resolution uses `globalThemeId` (then Default); the gallery
  and Manage controls still function.

## Testing

**Units — `lib/theme.ts` (bun, no DOM):**
- `resolveTheme`: `base: 'system'` → mode follows `systemDark`; pinned `base: 'dark'`
  / `'light'` ignores `systemDark`; **Default** per-region base → `'chrome'` resolves
  dark, `'document'` resolves light from the **same** theme; missing-variant falls
  back to the other variant then `{}`.
- `BUILTIN_THEMES`: every preset's override keys are a subset of `THEMEABLE_TOKENS`
  (registry whitelist invariant); ids are unique; `DEFAULT_THEME_ID` resolves.
- Migration: `loadThemeSettings` on a legacy `{ chrome, document }` blob → `{ themeId:
  DEFAULT_THEME_ID }`; on absent/malformed → Default; round-trips a valid `{ themeId
  }`.

**Unit — `applyTheme` (jsdom):**
- Sets `data-theme` to the resolved mode and `setProperty`s each override; switching
  to a theme without a previously-set token `removeProperty`s it (no stale inline
  value); a non-whitelisted override key is ignored.

**Migration — per-project (bun, main/registry or a pure normalizer):**
- A registry record with legacy `themeId: 'dark' | 'light' | 'system'` → normalized to
  "use global" (themeId absent) on read / on the `updateProjectSettings` validation
  path; a valid registry id passes through; an unknown id is dropped.

**Renderer (jsdom, the `tests/addProjectModal.test.ts` harness):**
- **Settings gallery:** renders one card per `THEME_LIST` entry with the selected card
  reflecting `themeSettings.themeId`; clicking a card calls `saveThemeSettings`/
  `onChange` with that `{ themeId }`; the Default card shows the split swatch and the
  `Default — mixed` label; **hover/focus does NOT call `onChange`/apply** (swatch-only,
  D5-9) — only a click/Enter commits.
- **Manage Projects select:** options are `Use global` + each built-in `name`;
  selecting a theme calls `onSetTheme(id, themeId)` (via Save); selecting `Use global`
  calls `onSetTheme(id, undefined)`; the field label reads `Theme`; the **swatch chip
  beside the select repaints when the selection changes** (and shows the global theme's
  swatch when `Use global` is selected).

## Touch points

```
MODIFIED
  src/shared/types.ts                              # ProjectBase.themeId: string; updateProjectSettings patch themeId: string
  src/main/ipc.ts                                  # updateProjectSettings handler: validate themeId ∈ registry (unknown → drop)
  src/main/registry.ts                             # (if read-time normalization is chosen) legacy themeId → absent
  src/renderer/src/lib/theme.ts                    # Theme model, THEMEABLE_TOKENS, BUILTIN_THEMES, generalized ThemeSettings,
                                                   #   resolveTheme(theme, systemDark, region), applyTheme, load/save migration
  src/renderer/src/App.tsx                         # resolution precedence, appShellRef + applyTheme effect, remove static data-theme attrs,
                                                   #   setProjectTheme(id, themeId?: string), Settings preview wiring, optional marker
  src/renderer/src/components/Settings.tsx         # theme gallery replaces the two Segmented controls; preview callbacks
  src/renderer/src/components/EditProjectModal.tsx # generalized theme <select> (Use global + theme list) + swatch chip; label "Theme"
  src/renderer/src/styles.css                      # .theme-gallery / .theme-card / .theme-swatch + .project-theme-chip (per-project swatch chip), built on tokens
CREATED
  tests/theme.test.ts                              # resolveTheme + applyTheme + migration + registry whitelist (web tsconfig)
  tests/themeGallery.test.ts                       # Settings gallery render/select/preview (jsdom harness)
  tests/projectThemeSelect.test.ts                 # EditProjectModal generalized select (jsdom harness)
```

(No new IPC, no preload changes, no `userData/themes/` — D5-6. `tests/theme.test.ts`
may absorb the gallery/select cases if a single renderer test file is preferred.)

## Sequencing

**Plan 5 builds AFTER Plan 4 merges** and must **reconcile against the post-Plan-4
codebase**, which the renderer already reflects today:

- `App.tsx` now imports `CommandPalette` + `lib/session`, owns the ⌘K keydown,
  `paletteOpen`, `restoreHeadingId` / `scrollNonce`, the scroll-anchor effect, and
  `setProjectTheme`. The Plan 5 resolution effect and `appShellRef` slot **alongside**
  these — do not regress the session-restore launch effect or the palette gate.
- The per-project theme control lives in **`EditProjectModal`** (opened from
  `ManageProjects`), **not** the Plan-3 inline compact select; Plan 5 generalizes that
  modal's `<select>`, and `ManageProjects.tsx` itself needs no theme change beyond
  passing the generalized `onSetTheme` signature.
- `types.ts` already carries `IndexChanged` / `onIndexChanged` (Plan 4 E2) and the
  `updateProjectSettings` patch shape — widen `themeId` to `string` **in place**
  without disturbing those.
- The command palette is a candidate future host for a "Theme…" entry, but that is
  **not** in Plan 5.

Land the **type-widening + registry/migration** slice first (isolated, re-run gates),
then `lib/theme.ts` model + `applyTheme` wiring, then the Settings gallery and the
generalized per-project select. Each is independently revertible.

## Open questions

1. **Default — mixed-pin vs. OS-following.** v1 **pins** today's mixed dark-chrome /
   light-document look (`base: { chrome: 'dark', document: 'light' }`) to guarantee no
   regression. D5-4 also calls Default "OS-following." These are in mild tension; the
   spec resolves it by pinning for v1 and treating per-region OS-following as the
   deferred **advanced override** (D5-7). Confirm pin-vs-follow is the intended v1
   behavior.
2. **Legacy per-project `themeId` migration mapping.** The spec collapses `'dark' |
   'light' | 'system'` → **"use global"** (the cleanest, falls out of unknown-id
   validation). The alternative — `'dark' → graphite`, `'light' → sepia`, `'system' →
   use global` — was rejected as surprising. Confirm "collapse to use global."
3. **4th preset identity — RESOLVED (D5-10): Graphite.** A neutral charcoal
   distinct-surface palette that retains the cobalt accent; overrides the
   bg/surface/surface-alt/border/ink token groups, accent left cobalt. **Forest** (deep
   green surfaces) was the named alternative and is **rejected**. No longer open.
4. **Optional per-project marker.** A small accent-tinted chip/rail by the project
   name is specified as **optional** (D5-5). Decide in/out — the whole-app recolor may
   already be cue enough, and an extra chip risks decoration.
5. **Exact preset hex values + contrast pass.** The overridden *token sets* are fixed;
   the concrete values for Sepia / High-contrast / Graphite are an implementation
   detail to finalize against a WCAG-AA check (the design-system palette is the source
   for accent/highlight choices).
6. **Live-preview scope — RESOLVED (D5-9): swatch-only + commit-to-apply.** Hover/focus
   never recolors the running app; the **token-faithful card swatch** is the preview, and
   only a click/Enter/Space commit applies a theme. Whole-app hover preview was rejected
   (modal covers most of the app; rapid hover across the 2×2 grid flickers). No longer
   open.
7. **Per-project control form — RESOLVED (D5-11): `<select>` + swatch chip.** A plain
   `.field` `<select>` (`Use global` + theme list) in EditProjectModal, paired with a
   small token-faithful swatch chip beside the selected option — **not** a mini-gallery.
   No longer open.
8. **Default — one card vs. two — RESOLVED (D5-12): one card, split swatch.** Default
   ships as a **single** card with a split (two-tone) swatch, labeled **"Default —
   mixed"** with a tooltip. The two-card alternative ("Default dark" / "Default light")
   would conflict with the pinned mixed look and inflate the 4-preset set to 5; rejected.
   No longer open.
```
