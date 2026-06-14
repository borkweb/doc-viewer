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

- **Concept:** today's exact look — **dark cobalt chrome + light document** — carried
  by one theme so "nothing regresses" (D5-4/D5-7). **Overrides: none** (both variants
  empty); it is pure passthrough to the existing `[data-theme="dark"]` /
  `[data-theme="light"]` base sets. The chrome resolves dark, the document resolves
  light, exactly as `DEFAULT_THEME = { chrome: 'dark', document: 'light' }` does
  today.
- **Token groups overridden:** **none.** Default *is* the base.
- *(Residual: see Open questions — whether Default should instead follow OS uniformly.
  v1 pins the mixed look to guarantee no regression.)*

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

- **Concept:** the **distinct-surface** identity (D5-4 — *not* accent-only). Shifts the
  whole surface stack off cobalt-blue toward **neutral charcoal/graphite**, keeping
  the cobalt accent as the single pop of color so it reads as a clearly different app
  skin. Pinned dark.
- **Token groups overridden (coherent groups):**
  - **bg/surface group** (the defining move, together): `--bg --surface --surface-alt
    --surface-raised --code-bg --table-head --diagram-bg` → neutral graphite grays
    (e.g. `#15171a → #1d2024 → #26292e → #2f333a`).
  - **border group** (together): `--border --border-strong --faint` → neutral gray.
  - **ink-on-graphite:** `--diagram-ink --code-fg` → neutral light gray to match the
    new surfaces.
  - **accent family: left untouched** — cobalt `--accent*` stays, intentionally, as
    the recognizable highlight against the neutral field.

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
┌─ Settings ───────────────────────────────────────────── ✕ ─┐
│  Theme                                                      │  ← .section-label
│  Applies to the whole app. Override per project in Manage.  │  ← hint copy
│                                                             │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐    │
│  │ ▍▍ ▍▍ Aa  │ │ ▍▍▍▍      │ │ ▍▍▍▍      │ │ ▍▍▍▍      │    │
│  │ ▍▍ ▍ ▍    │ │           │ │           │ │           │    │
│  │ Default ✓ │ │ Sepia     │ │ High con… │ │ Graphite  │    │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘    │
│   (selected)                                                │
└─────────────────────────────────────────────────────────────┘
```

- **Cards in a responsive grid** (`repeat(auto-fill, minmax(~150px, 1fr))`) inside the
  modal body. The modal **widens** from today's ~440px to comfortably hold 2 columns
  (~`min(560px, 92vw)`).
- **Swatch preview** per card: a small band of color chips drawn **from the theme's
  own resolved tokens** — `--bg`, `--surface`, `--surface-alt`, `--accent`, and an
  `--fg` "Aa" sample — so the card shows the actual palette, not a static thumbnail.
  For **Default**, the swatch shows the split (dark chrome chip + light document chip)
  to telegraph the mixed look.
- **Card body:** theme `name` + a one-line muted descriptor.
- **Selected state:** the active card carries an `--accent` ring (reuse
  `--accent-ring`) + a `fa-check`, mirroring `.segmented .active` / `.tree-item.active`
  treatment.
- **Live preview on hover/select (verbatim from D5-7 intent):** **hovering** a card
  previews that theme on the live app behind the modal (App applies the hovered
  theme's resolution transiently); **moving off** without clicking reverts to the
  committed theme; **clicking** commits it (writes `{ themeId }` via
  `saveThemeSettings`). This reuses the same `applyTheme` path — preview is just a
  transient `effectiveId`. Gated by `prefers-reduced-motion`-independent logic (it's a
  color swap, not motion), but the **transient apply is suppressed entirely** if the
  user prefers reduced motion is **not** required — color preview is allowed; only the
  card-entrance animation respects reduced motion.
- **Keyboard:** the gallery is a `role="radiogroup"`; cards are `role="radio"`,
  arrow-key navigable, Enter/Space commits; focus rings via `--accent-ring`. Hover
  preview has a focus equivalent (focusing a card previews it).

**Verbatim copy (Settings):**

| Element | Copy |
|---------|------|
| Section label | `Theme` |
| Section hint | `Applies to the whole app. Override per project in Manage Projects.` |
| Card — Default | `Default` · descriptor `Cobalt dark chrome, light document` |
| Card — Sepia | `Sepia` · descriptor `Warm paper, easy on the eyes` |
| Card — High contrast | `High contrast` · descriptor `Maximum legibility` |
| Card — Graphite | `Graphite` · descriptor `Neutral graphite surfaces` |
| Selected aria | `{name} (selected)` |

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
- Commit path is unchanged: `onSetTheme(project.id, themeId | undefined)` →
  `updateProjectSettings(id, { themeId })` → `refreshProjects()`. When the edited
  project is active, the resolution effect re-applies instantly.
- **Verbatim copy:** field label `Theme`; the "use global" option `Use global`; each
  built-in by `name`.

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
  hover card  → App applies previewId via applyTheme (transient; revert on leave)
  click card  → saveThemeSettings({ themeId }) → setThemeSettings → resolution effect
                  → applyTheme(.app-shell, …) + applyTheme(.content, …)

Manage Projects → EditProjectModal select
  pick theme  → onSetTheme(id, themeId|undefined)
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
- **Hover-preview never commits** → leaving a card without clicking reverts to the
  committed `themeId`; closing Settings reverts any uncommitted preview.
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
  `onChange` with that `{ themeId }`; the Default card shows the split swatch;
  hover-preview applies then reverts without committing.
- **Manage Projects select:** options are `Use global` + each built-in `name`;
  selecting a theme calls `onSetTheme(id, themeId)`; selecting `Use global` calls
  `onSetTheme(id, undefined)`; the field label reads `Theme`.

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
  src/renderer/src/components/EditProjectModal.tsx # generalized theme <select> (Use global + theme list); label "Theme"
  src/renderer/src/styles.css                      # .theme-gallery / .theme-card / .theme-swatch (+ optional .project-theme-marker), built on tokens
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
3. **4th preset identity.** **Graphite** (neutral graphite surfaces, cobalt accent
   retained) is chosen as the distinct-surface palette; **Forest** (deep green
   surfaces) was the named alternative. Confirm Graphite.
4. **Optional per-project marker.** A small accent-tinted chip/rail by the project
   name is specified as **optional** (D5-5). Decide in/out — the whole-app recolor may
   already be cue enough, and an extra chip risks decoration.
5. **Exact preset hex values + contrast pass.** The overridden *token sets* are fixed;
   the concrete values for Sepia / High-contrast / Graphite are an implementation
   detail to finalize against a WCAG-AA check (the design-system palette is the source
   for accent/highlight choices).
```
