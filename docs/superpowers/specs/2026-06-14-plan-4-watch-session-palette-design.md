# Plan 4 — File Watch, Session Memory & Command Palette (Design)

**Status:** Approved design, pending implementation plan.
**Parent spec:** `docs/superpowers/specs/2026-06-14-doc-viewer-design.md`
**Predecessors:** Plan 1 (core local viewer), Plan 2a/2b (GitHub backend + UI), Plan 3 (Manage Projects).

## Goal

Make Curator feel *live* and *fast to navigate*. Three independent quality-of-life
features, each its own reviewable PR, shipped in order **E3 → E4 → E2**:

- **E3 — Session memory:** relaunching restores where you were (last project, last
  doc, scroll position), per project, fail-soft.
- **E4 — Command palette:** a ⌘K / Ctrl+K palette to jump to any project, any doc in
  the current project, or run a command — no mouse, no menu-hunting.
- **E2 — File watch + live reindex:** edits to a local project's files on disk are
  picked up automatically (debounced full reindex), the open document silently
  re-renders, and deleting the open doc shows a gentle notice — without a manual
  Reindex.

The slices are deliberately ordered so the cheapest, lowest-risk renderer-only work
(E3) lands first, the next renderer-only feature (E4) second, and the
backend/IPC-touching watcher (E2) — which depends on a new push channel and reuses
E3's restore + scroll machinery for its silent re-render — lands last.

## Scope

**In scope**
- **E3:** `lib/session.ts` (localStorage, mirrors `lib/theme.ts`); persist last
  project + last doc + a best-effort nearest-heading scroll anchor, **per project**;
  auto-restore on launch, guarded fail-soft to the home/Manage view.
- **E4:** `CommandPalette.tsx` + `lib/fuzzy.ts` (hand-rolled subsequence scorer);
  ⌘K/Ctrl+K open via a single App-level `keydown`; tiers 1–2 (all Projects + current
  project Documents + a fixed command set).
- **E2:** `node:fs` `watch(root, { recursive: true })` per active local project;
  debounced (~300 ms trailing) **full** reindex via the existing
  `selectLocal`/`rebuildProject` path; a new `index:changed` main→renderer push
  channel; silent scroll-preserving re-render of the open doc; a "This document was
  removed." notice on delete-of-open-doc.

**Out of scope (later plans)**
- **Palette tier 3** (cross-project cached GitHub docs) — needs a new
  manifest-enumeration IPC; deferred.
- **Fuzzy `<mark>` highlighting** — v1 is **rank-only**: `lib/fuzzy.ts` returns a
  single numeric score and the list is ordered by it; no per-character `<mark>`
  spans are rendered in result labels. Highlighting the matched characters is a
  deferred **fast-follow** (it reuses the same scorer, adding a match-index pass).
- **Results virtualization** — the Documents tier is hard-capped (see E4 overflow)
  rather than windowed; no virtual scroller is introduced.
- **Incremental reindex** — E2 does a debounced *full* reindex; no per-file patching.
- **Linux recursive watch** — `fs.watch` `recursive` is a no-op on Linux; E2 degrades
  to non-recursive + a note, with manual Reindex as the fallback. No `chokidar`-style
  dependency (cannot npm-install).
- **Main-side settings IPC / `userData/session.json`** — E3 persists in renderer
  `localStorage`; consolidating theme + session into a main-process settings file is a
  future cleanup (noted under E3 → Future).
- **Watching GitHub projects** — GitHub projects are cache-backed (clone deleted);
  they are **never** watched.
- Raw-pixel scroll restore — invalidated by E2's live re-render; E3 uses a heading
  anchor instead.

**Design decisions considered and resolved (from dual council)**
- *Decomposition:* one Plan 4, three slices, three PRs, order E3 → E4 → E2 (D4 intro).
- *Watch impl:* Node built-in `fs.watch` only — no third-party watcher (D4-1).
- *Reindex:* debounced **full** reindex, not incremental patching (D4-2).
- *Session store:* renderer `localStorage`, not main-side IPC (D4-4).
- *Scroll restore:* nearest-heading anchor, not pixel offset (D4-5).
- *Palette keybinding:* App-level renderer `keydown`, not Electron `globalShortcut`
  (D4-8).

## What already exists (reuse, don't reinvent)

- **Design system:** the `design-system` skill (Curator "Cobalt Reader" theme) +
  `styles.css` tokens (`--surface`, `--surface-alt`, `--border`, `--muted`,
  `--faint`, `--accent`, `--accent-ring`, `--radius-*`, `--space-*`, `--text-*`).
- **`.modal` / `.modal-overlay`** (AddProjectModal, Settings) — the palette reuses the
  overlay + panel chrome (centered, scrim, `--surface` panel, `--radius-lg`).
- **`.field`** — the palette search input vocabulary.
- **`.empty-state` / `.empty-icon`** — the palette's no-match state and the
  delete-of-open-doc notice draw from the same icon + muted-copy vocabulary.
- **`.icon-button`** (TopBar) — any palette-trigger affordance if added.
- **`lib/theme.ts`** — the persistence precedent E3's `lib/session.ts` mirrors
  verbatim (localStorage, try/catch fail-soft, typed load/validate).
- **`build:progress` `e.sender.send` pattern** (ipc.ts) + **`onBuildProgress`**
  subscribe/unsubscribe (preload) — the template for E2's `index:changed` channel and
  its `onIndexChanged` bridge.
- **`treeHasPath` guard** (App.tsx, added in Plan 3) — reused to decide whether the
  open `docPath` survives an auto-reindex.
- **`active?.id === id` guard pattern** (projectService `rebuildProject`,
  `loadGithubRef`) — reused by the watcher so a callback/reindex that fires after the
  user switched away is a no-op.
- **`scrollToId` / `scrollNonce` + the post-`enhanceDiagrams` continuation** (DocView)
  — E3's heading-anchor restore hooks the *same* post-enhance continuation but runs a
  **parallel** path; it does **not** overload the heading-jump machinery.

---

## Slice E3 — Session memory (PR 1)

*Renderer-only. No IPC, no main changes. Ships independently.*

### E3 architecture

**New file `src/renderer/src/lib/session.ts`** — mirrors `lib/theme.ts` exactly in
shape (localStorage key `curator.session`, `load`/`save`, try/catch fail-soft, a
typed validator that drops anything malformed):

```ts
interface DocAnchor { docPath: string; headingId?: string } // headingId = nearest heading above the viewport top
type SessionState = {
  lastProjectId?: string
  perProject: Record<string, DocAnchor> // keyed by project id
}
export function loadSession(): SessionState
export function saveSession(s: SessionState): void
```

- **Scope (D4-5):** persist **last project** (`lastProjectId`) + **last doc + scroll
  anchor per project** (`perProject[projectId]`). Switching projects updates
  `lastProjectId`; opening a doc updates that project's `DocAnchor`.
- **Scroll anchor (D4-5):** **not** a pixel offset. On scroll (throttled **~250 ms**,
  trailing) and on doc change, compute the `id` of the nearest rendered heading
  at/above the `.content` scroll-container top and store it as `headingId`. Restore scrolls that heading into
  view. Pixels are intentionally avoided because E2's live re-render shifts layout and
  invalidates any saved offset.

**`App` wiring:**
- On mutation of the open doc / active project, write through to `saveSession`
  (debounced; piggyback the existing `selectProject` / `openDoc` callbacks).
- The scroll container is the `.content` `<main>` (`overflow-y: auto`), **not**
  DocView's inner div — the scroll listener attaches there.

**Scroll restore path (D4-5, grounded in DocView):**
- DocView only scrolls **after** `enhanceDiagrams(container).then(...)` (mermaid is
  async and shifts layout). Heading-anchor restore must hook that **same**
  post-enhance continuation so the target exists and layout is settled.
- This is a **parallel** restore path — it does **not** reuse / overload the existing
  `scrollToId` / `scrollNonce` heading-jump (which is for Contents-menu jumps and
  search hits). A new optional prop (e.g. `restoreHeadingId`) is consumed once, on
  first render of a restored doc, inside the post-enhance `.then`.
- Restore is **best-effort, fail-soft, silent:** if the heading no longer exists (doc
  changed), do nothing — leave the doc at the top. Degrading to **project + doc only**
  (no scroll) is explicitly acceptable if anchoring proves fragile.

### E3 — restore-on-launch behavior (D4-6, what the user sees)

On launch, after `listProjects()` resolves, attempt **auto-restore**, guarded
fail-soft to the home/Manage (empty) view. Four cases:

| Case | What's saved | What the user sees |
|------|--------------|--------------------|
| **Happy path** | project exists, doc still in tree, build OK | the app opens directly to that project + doc, scrolled to the saved heading anchor (best-effort) |
| **Project missing/unavailable** | `lastProjectId` not in registry, or `status === 'unavailable'` | fall back to the standard home empty-state ("Add or select a project to begin."); stale session entry is ignored, not surfaced |
| **Doc no longer in tree** | project restores, but `perProject[id].docPath` fails `treeHasPath` | open the project at its empty content state ("Select a document."); no error |
| **Build stale / in progress** | project selected, tree not yet ready | select the project (its normal async `selectProject` runs); restore the doc once the tree arrives and `treeHasPath` passes, else fall to "Select a document." |
| **First run** | no session at all | standard home empty-state; nothing to restore |

All guard failures are **silent** — no toast, no error. A malformed/absent
`localStorage` value yields an empty `SessionState` (validator drops it), which is the
first-run path.

### E3 testing

**Renderer (bun + jsdom, the `tests/addProjectModal.test.ts` harness)**
- `loadSession` returns an empty state for absent/malformed JSON (parity with
  `lib/theme.ts` tests); `saveSession`→`loadSession` round-trips.
- Save writes `lastProjectId` + the active project's `DocAnchor`; switching projects
  updates `lastProjectId`; opening a doc updates that project's entry only.
- **Restore guards:** project-missing → home empty-state; doc-not-in-tree (`treeHasPath`
  false) → project's "Select a document." state; first-run (no session) → home; happy
  path selects the project and opens the doc.
- Scroll-anchor restore is **best-effort:** a missing heading id leaves the doc at the
  top without throwing.

### E3 — Future (noted, not in scope)

Consolidate theme + session into a main-process `userData/session.json` behind a
settings IPC, so state survives a renderer storage clear and is inspectable. Out of
scope for Plan 4 (D4-4).

### E3 touch points

```
MODIFIED
  src/renderer/src/App.tsx        # save-through on nav; auto-restore on launch; scroll-container listener
  src/renderer/src/components/DocView.tsx  # optional restoreHeadingId prop, consumed in the post-enhance .then
CREATED
  src/renderer/src/lib/session.ts
  tests/session.test.ts           # load/save/validate + restore guards (web tsconfig)
```

---

## Slice E4 — Command palette (PR 2)

*Renderer-only. No IPC, no main changes. Ships independently.*

### E4 architecture

**New `src/renderer/src/components/CommandPalette.tsx`** + **`src/renderer/src/lib/fuzzy.ts`**
(a hand-rolled subsequence scorer — **no dependency**; cannot npm-install). The palette
is **data-driven from state already held in `App`:** `projects`, `tree`, and the bound
callbacks `selectProject` / `openDoc` / `focusBranchSwitcher` (the "Switch ref…" command
— App focuses the existing `BranchSwitcher`, the palette does not switch refs itself) /
`setView` / `setAddOpen` / `setSettingsOpen` / `rebuild`. App passes these in; the
palette holds no IPC of its own.

**Keybinding (D4-8) — first app-level key handler in the codebase:**
- A single App-level `keydown` listener toggles the palette on **⌘K (mac) / Ctrl+K
  (win/linux)**, calling `preventDefault()`. It fires **even when focus is in an
  input** (so it works mid-typing in the filter box, etc.).
- **Not** Electron `globalShortcut` (that would fire app-wide / when unfocused).
- **Escape precedence:** the palette's own Escape handler closes the **palette first**
  and stops propagation, composing with the existing per-component Escape handlers
  (Settings, TopBar menu, StatusBar menu, inline rename). Verify modal stacking: if a
  modal (Add / Settings) is open, ⌘K is suppressed or the palette layers above it
  consistently — the palette and modals must not both consume Escape ambiguously. The
  resolved rule: **Escape closes the topmost surface only.**

### E4 — palette scope (D4-7): tiers 1–2

| Tier | Source | Item label | Jump action |
|------|--------|-----------|-------------|
| **Projects** | every entry in `projects` | project `name` (+ `local`/`github` chip) | `selectProject(id)` |
| **Documents** | `tree` of the **current** project (flattened) | doc `title` (+ muted relative path) | `openDoc(path)` |
| **Commands** | fixed set (below) | command label | the bound callback |

**Command set (verbatim labels):**

| Label | Action |
|-------|--------|
| "Add project" | `setAddOpen(true)` |
| "Manage projects" | `setView('manage')` |
| "Pull latest / Reindex" | `rebuild()` (label adapts: "Reindex" for local, "Pull latest" for github — both map to `rebuildProject`) |
| "Settings" | `setSettingsOpen(true)` |
| "Switch ref…" | (github active only) **closes the palette and opens the existing `BranchSwitcher`** (status bar) — focuses its ref `<select>`. **No inline ref sub-items** in the palette; ref selection happens in the existing switcher via `switchRef`. |

Items whose action requires an active project (Documents, Reindex, Switch ref) are
**hidden** when no project is active. **Tier 3** (cross-project cached GitHub docs) is
**deferred** — it needs a new manifest-enumeration IPC.

### E4 — UI design detail (command palette)

The palette is the one genuinely **new** surface in Plan 4, so its design is
specified to implementation depth here. It is **not** a generic Spotlight clone: it is
a Curator chrome surface that happens to float — dense rows, mono doc paths, the
existing `local`/`github` chips, Font Awesome glyphs already in the app, and Cobalt
Reader tokens throughout.

#### Panel & layout

- Reuses `.modal-overlay` (scrim + `blur(2px)`) and a centered-horizontally,
  **top-pinned** `.modal`-style panel — the palette convention is *near the top*, not
  dead-center. Pin offset: `margin-top: 12vh` (≈ top third), so the eye lands on the
  search field, not the middle of the window.
- **Width** `min(640px, 92vw)` — wider than the 440px Settings modal because rows carry
  a label + path; **radius** `--radius-xl` (modal class), **shadow** `--shadow-lg`,
  fill `--surface-raised`, hairline `--border` — identical chrome to Settings/Add.
- **Structure:** a header row holding the search input (no title bar — the input *is*
  the affordance), a hairline divider, then a scrolling results region capped at
  `max-height: min(56vh, 420px)` with the list scrolling internally (`overflow-y:auto`).
  Group headers are sticky within that scroll region.
- New CSS lives under a `.palette-*` namespace built on `.modal-overlay` + tokens
  (`styles.css` touch point already listed) — no bespoke colors or radii.

#### Information hierarchy of a result row

Every row is one flex line: **type icon · primary label · secondary hint** (· trailing
chip for Projects). One register only — `--text-ui` (13px), the dense chrome size. The
three tiers are distinguished by **icon + group header**, not by differing row heights
or fonts (keeps the list calm and scannable).

| Tier | Leading icon | Primary (`--fg`) | Secondary (`--muted`) | Trailing |
|------|--------------|------------------|------------------------|----------|
| **Projects** | `fa-folder` (local) / `fa-github` (github) | project `name` | — | `local`/`github` chip (`[data-chip]`, lowercase) |
| **Documents** | `fa-file-lines` | doc `title` | relative path, **monospace** (`--font-mono`, `--muted`, ellipsized left/RTL) | — |
| **Commands** | per-command glyph (below) | verb label | — | — |

- **Primary** is `--fg`, weight 400 at rest; the **highlighted** row goes
  `--accent-soft` background + `--accent` text + weight 600 — the exact treatment
  `.tree-item.active` already uses, so palette selection reads identically to a selected
  tree row.
- **Doc path is the only monospace element** — the IDE tell. It ellipsizes (RTL, like
  `.status-source-text`) so the meaningful tail (filename) stays visible.
- Command glyphs reuse the app's existing vocabulary: `fa-plus` (Add project),
  `fa-list` (Manage projects), `fa-rotate` (Pull latest / Reindex), `fa-gear`
  (Settings), `fa-code-branch` (Switch ref…).

#### Compact ASCII mock (empty query, project active)

The **empty query** state lists **Projects + Commands only** — **no Documents tier**.
Documents are numerous and only meaningful once the user has a search term, so the
empty state shows a single muted **hint** where the Documents group would be:

```
┌──────────────────────────────────────────────────────────────┐
│ 🔍  Search projects, docs, and commands…                     │  ← input, autofocus
├──────────────────────────────────────────────────────────────┤
│ PROJECTS                                                     │  ← sticky group header
│   📁  Curator                                       [local]  │
│ ▌ 🐙  design-system-docs                           [github]  │  ← highlighted (accent-soft)
│   📁  api-handbook                                  [local]  │
│   Type to search documents…                                 │  ← muted hint (not a row; no Documents tier yet)
│ COMMANDS                                                     │
│   ＋  Add project                                            │
│   ↻  Reindex                                                │
│   ⎇  Switch ref…                                            │
│   ⚙  Settings                                               │
└──────────────────────────────────────────────────────────────┘
```

Once the user types, the **Documents** group appears (scored, see overflow cap
below) between Projects and Commands and the hint disappears.

(Glyphs are illustrative; the real surface uses the Font Awesome classes named above.)

#### Interaction states

```
OPEN (empty query)        | RESULTS (typing)              | NO MATCH
--------------------------|-------------------------------|---------------------------
input autofocused;        | grouped, scored list;         | input retains text;
Projects + Commands only  | first/highest-scored row      | single muted row:
(NO Documents tier);      | highlighted; non-empty        | "No matches."
muted hint where Docs     | groups only; rank-only        | (.empty vocabulary;
would be:                 | scoring (no <mark>); Docs tier |  no Add CTA)
"Type to search docs…"    | hard-capped (see overflow)    |
```

- **Open / empty query (autofocus):** focus the input immediately on mount; show
  **Projects + the Command set only** — the **Documents tier is omitted** until the user
  types (docs are numerous and only meaningful with a query). Where the Documents group
  would sit, render a single muted **hint line** "Type to search documents…" (the
  `.palette-hint` vocabulary — muted copy, **not** a selectable row, skipped by arrow
  nav). The **first row is pre-highlighted** so Enter is meaningful immediately. **No
  loading state** — all data is already in renderer state (instant); there is no async
  fetch and therefore no spinner.
- **Results:** as the user types, `lib/fuzzy.ts` scores each item by subsequence match
  against its label (and, for Documents, the path too) and returns a **single numeric
  score**; sub-threshold items drop. The **Documents tier now appears** (between Projects
  and Commands). **Scoring is rank-only for v1** — the scorer **favors prefix and
  contiguous matches** so a higher-ranked row is obviously the better match without any
  `<mark>` character highlighting (that is a deferred fast-follow). **Ordering:** score
  descending; **ties broken by tier order** (Projects → Documents → Commands) so grouping
  stays legible. Group headers render only for non-empty groups. After every keystroke
  the highlight resets to the **first** (top-scored) row.
- **No match:** a single muted **"No matches."** row in the `.empty` vocabulary — no Add
  CTA (distinct from a truly empty registry, which is the home empty-state's job).
- **Keyboard-selected row:** exactly one row carries the highlight at all times (never
  zero) — `--accent-soft` bg + `--accent` text + weight 600, mirroring
  `.tree-item.active`. The highlighted row is always scrolled into view
  (`scrollIntoView({ block: 'nearest' })`).
- **No project active:** Documents, Pull latest / Reindex, and Switch ref… are
  **hidden** (their actions need an active project). The palette still lists Projects +
  Add project / Manage projects / Settings, so it is never empty on a fresh launch.
- **Documents overflow (hard cap, no virtualization):** the Documents tier is capped at
  **~50 results by score**. When more docs match, render the top 50 and append a single
  muted, **non-selectable** overflow row "…and N more — keep typing" (the
  `.palette-more` vocabulary; skipped by arrow nav, like a group header) that nudges the
  user to narrow the query rather than scroll. Projects and Commands are small fixed sets
  and are **not** capped. No virtual scroller is introduced (out of scope); the capped
  list scrolls normally within the results region.

#### Motion

- **Open:** overlay scrim fades in and the panel rises a few px into place —
  `--transition-slow` (220ms) with `--ease-out`, capped **≤200ms** for the panel
  (`opacity` + `transform: translateY(-4px)→0`). **Close:** instant (unmount) — no exit
  animation to slow down repeat invocations.
- **Row highlight / hover** color shifts use `--transition` (120ms), same as tree rows.
- **`prefers-reduced-motion: reduce` → no entrance transform/fade; the panel appears
  instantly** (mirrors the `.manage-project-row` reduced-motion guard already in
  `styles.css`).

#### Keyboard model

| Key | Behavior |
|-----|----------|
| **⌘K / Ctrl+K** | Toggle palette open/closed (App-level `keydown`, `preventDefault`; fires even when an input is focused — see Keybinding). |
| **↑ / ↓** | Move highlight across the **flattened** result list, **skipping group headers**, **wrapping** at both ends (↓ past last → first; ↑ past first → last). Highlighted row is scrolled into view (`block:'nearest'`). |
| **Enter** | Activate the highlighted row's jump action, then **close** the palette. |
| **Escape** | Close the palette — **topmost-surface-only** (stops propagation; see below). |
| **Tab / Shift+Tab** | Focus stays trapped within the palette (input ↔ list); does not leak to the underlying app. |

- Mouse **hover** also sets the highlight (so keyboard and pointer never disagree);
  **click** activates the row.
- The input keeps DOM focus the whole time; ↑/↓/Enter are handled on the input's
  `keydown` and drive a `activeIndex` state (roving virtual selection via
  `aria-activedescendant`), so the user types and navigates without a focus hop.

#### Escape precedence — composing with the 5 existing handlers

Plan 4 introduces the first App-level key handler. The codebase already has **five**
per-surface Escape handlers: **Settings**, **TopBar Contents menu**, **StatusBar
diagram menu**, **BranchSwitcher**, and **ManageProjects inline rename**. The rule is
**Escape closes the topmost surface only**:

- The palette's Escape handler calls `stopPropagation()` so a single Escape closes the
  **palette** and nothing underneath it also reacts.
- **Modal stacking:** if a modal (Add / Settings) is already open, **⌘K is suppressed**
  — we do not stack the palette over another modal. (Simpler and avoids two surfaces
  fighting over Escape; the palette is a primary navigation surface, not something you
  reach for mid-modal.)
- This must be **verified against all five** handlers under the topmost-surface rule
  (cross-slice note already calls this out).

#### Verbatim copy

| Element | Copy |
|---------|------|
| Search placeholder | `Search projects, docs, and commands…` |
| Empty-query docs hint | `Type to search documents…` (muted; shown only when the query is empty) |
| Documents overflow row | `…and N more — keep typing` (muted; `N` = matched docs beyond the ~50 cap) |
| No-match row | `No matches.` |
| Group header — Projects | `Projects` |
| Group header — Documents | `Documents · <project name>` (names the current project, since docs are scoped to it) |
| Group header — Commands | `Commands` |
| Command label — add | `Add project` |
| Command label — manage | `Manage projects` |
| Command label — rebuild (local) | `Reindex` |
| Command label — rebuild (github) | `Pull latest` |
| Command label — ref | `Switch ref…` (trailing ellipsis = opens a further chooser) |
| Command label — settings | `Settings` |
| Delete-of-open-doc notice (E2) | `This document was removed.` |

All sentence case, terse, canonical vocabulary (Project / Document / Ref; "Reindex" /
"Pull latest", never "Refresh"). The rebuild command label **adapts to the active
project's source** — it is never literally "Pull latest / Reindex" in the UI; it shows
the one that applies.

#### Accessibility

- **Roles:** overlay panel is `role="dialog"` `aria-modal="true"` `aria-label="Command
  palette"` (mirrors Settings). The results region is `role="listbox"`; each row is
  `role="option"` with a stable `id`; group headers are `role="presentation"` (skipped
  by arrow nav and by AT as options).
- **Selection:** the input owns focus and carries `aria-activedescendant={highlighted
  option id}` — a roving **virtual** focus, so screen readers announce the highlighted
  row as the user arrows without moving DOM focus off the input. `aria-selected="true"`
  on the highlighted option.
- **Targets:** rows are comfortable click targets — `min-height: 32px` is the chrome
  norm here; on this **desktop-only** Electron surface 44px is not required, but rows
  must not be denser than the 28–32px chrome controls elsewhere. (Note the desktop
  context explicitly so a reviewer doesn't flag the sub-44px rows.)
- **Contrast & focus:** all color via tokens (`--fg` on `--surface-raised`,
  `--muted` for paths/headers) which already meet contrast in both themes; the
  highlighted row uses `--accent-soft`/`--accent`. The input keeps a visible
  `--accent-ring` focus halo. Focus is **trapped** in the dialog and **restored** to the
  previously focused element on close.

#### AI-slop guardrails (what makes this Curator, not Spotlight)

- **No hero, no oversized icons, no gradient, no glow on the panel.** The cobalt glow is
  reserved for primary-button hover, not chrome surfaces — the palette uses the flat
  `.modal` chrome.
- **Dense, single-register rows** (`--text-ui`), 4px rhythm, hairline group dividers —
  the same calm surface as the sidebar tree, not a roomy launcher.
- **Monospace only where it earns it:** the doc path. Everything else is the UI font.
- **Reuse, don't reinvent:** `.modal-overlay`/`.modal` chrome, the `local`/`github`
  chip, `.empty` no-match vocabulary, `.tree-item.active` highlight treatment, and Font
  Awesome glyphs already in the app. No new component vocabulary, no new color.

### E4 data flow

```
⌘K (App keydown, preventDefault) → setPaletteOpen(true)
CommandPalette (props: projects, tree, callbacks)
  query → lib/fuzzy.score(item.label) → ranked, tier-grouped list
  Enter/click on item →
    project   → selectProject(id)        ─┐
    doc       → openDoc(path)             ├─ then setPaletteOpen(false)
    command   → bound App callback        ─┘
Escape → close palette (topmost-surface rule)
```

### E4 testing

**Renderer (bun + jsdom, the `tests/addProjectModal.test.ts` harness)**
- ⌘K / Ctrl+K opens the palette; Escape closes it; the open handler fires even when an
  input is focused.
- **Empty query** lists all projects **+ the command set only** (NO Documents tier) and
  renders the muted **"Type to search documents…"** hint, grouped.
- **Typing surfaces the Documents tier:** with a query, `lib/fuzzy.ts` filters and the
  Documents group appears; a unique subsequence narrows to the expected item; a
  non-matching query shows the **"No matches."** row and the hint is gone.
- Selecting a project item calls `selectProject(id)` and closes; a doc item calls
  `openDoc(path)`; each command label invokes its bound callback.
- **"Switch ref…"** (github active) closes the palette and focuses the BranchSwitcher's
  ref `<select>` (no inline ref sub-items).
- Document/Reindex/Switch-ref items are hidden when no project is active.
- **Documents cap:** with >50 matching docs, only 50 doc rows render plus the muted
  **"…and N more — keep typing"** overflow row (non-selectable).
- ↑/↓ move the highlight (skipping headers, the hint, and the overflow row; wrapping);
  Enter activates the highlighted item.
- **Escape precedence:** with the palette over a base view, Escape closes the palette
  and does not also trigger a component-level Escape handler.
- **`lib/fuzzy.ts` unit:** returns a **single numeric score**; prefix and contiguous
  matches score higher than scattered subsequence matches; a non-subsequence returns
  `0` / no match (so the caller drops it).

### E4 touch points

```
MODIFIED
  src/renderer/src/App.tsx        # paletteOpen state; App-level ⌘K/Ctrl+K keydown; render <CommandPalette>; pass callbacks
  src/renderer/src/styles.css     # .palette-* (built on .modal-overlay / tokens)
CREATED
  src/renderer/src/components/CommandPalette.tsx
  src/renderer/src/lib/fuzzy.ts
  tests/commandPalette.test.ts    # renderer (web tsconfig)
  tests/fuzzy.test.ts             # scorer unit (web tsconfig)
```

---

## Slice E2 — File watch + live reindex (PR 3)

*Touches main, preload, shared types, and the renderer. Ships last — it reuses E3's
restore + scroll-preserve behavior for the silent re-render and adds the only new IPC.*

### E2 architecture

**Watcher (main, D4-1):** a new `src/main/watcher.ts` module owns a single active
watcher. When a **local** project becomes active, start a `node:fs`
`watch(root, { recursive: true })`. On a fired event, schedule a debounced reindex
(below). Stop/replace the watcher when the active project changes or the window closes.
**GitHub projects are never watched** (cache-backed, clone deleted). For testability the
`watch` function is **injectable** (the test passes a fake watch fn, exactly as
`clone.ts` injects `spawn`) so the debounce + active-id guard are unit-testable with no
real filesystem events.

- **Platform (D4-1):** `recursive` works on **macOS/Windows**. On **Linux** it's a
  no-op → degrade to a **non-recursive** watch on the root plus a logged note; manual
  Reindex remains the fallback. (No third-party recursive watcher — cannot
  npm-install.)
- **Guard (architecture grounding):** the watcher callback and the reindex it triggers
  must re-check the **`active?.id === id`** guard (the same pattern
  `rebuildProject`/`loadGithubRef` use) — a debounced callback can fire *after* the
  user has switched projects; if so, it's a **no-op**.

**Debounced reindex (D4-2):** ~**300 ms trailing**, **leading-edge suppressed** (the
first event in a burst does **not** trigger immediately; only the trailing edge after
quiet does). The reindex is a **full** reindex reusing the existing
`selectLocal` / `rebuildProject` path — **no incremental patching**. After reindex,
push the new tree to the renderer.

**New push channel `index:changed` (E2, mirrors `build:progress`):**
- **The plumbing problem (resolved):** `build:progress` rides on the IPC *invoke* event
  (`e.sender.send`), but a watcher event fires **asynchronously**, outside any IPC call —
  there is no `e`. So the watcher cannot reach the renderer the way `progressTo(e)` does.
- **Resolution — capture `webContents` at window creation.** `src/main/index.ts` already
  builds the single `BrowserWindow` in `createWindow()`. Store that window in a
  module-level ref and expose its `webContents` to the watcher layer (e.g. a
  `setMainWindow(win)` / `getMainWindow()` accessor in a small main module, or pass
  `win.webContents` into the watcher-owning service when the window is created). On
  `'closed'`, clear the ref. The watcher pushes via the captured
  `webContents.send('index:changed', { projectId, tree, docCount })`, guarded by
  `!webContents.isDestroyed()` (same intent as `build:progress`'s `isDestroyed()` guard).
- **Active-id guard at the push site:** the push fires **only** when
  `active?.id === watchedId` (the project the watcher was started for is still the active
  one). A debounced reindex that resolves after the user switched away pushes nothing.
- Preload: add `onIndexChanged(cb)` returning an unsubscribe fn (mirror
  `onBuildProgress`); add it to `IpcApi` in `src/shared/types.ts`.

**Renderer handling of `index:changed`:**
- App subscribes via `onIndexChanged`. On a push for the **active** project: `setTree`
  to the new tree.
- **Open-doc preservation (D4-3, reuses Plan 3's `treeHasPath`):** if `docPath` is set
  and still satisfies `treeHasPath(newTree, docPath)`, **keep it open** — DocView
  silently re-renders the changed content. **Preserve scroll** using E3's
  heading-anchor restore (a pixel offset would be invalidated by the layout shift), and
  debounce so a burst of saves doesn't thrash. This is the concrete dependency on E3
  landing first.
- **Delete-of-open-doc (D4-3):** if `docPath` is set and **no longer** in the new tree,
  clear the open doc to the content empty-state and show a gentle notice **"This document
  was removed."** rendered in the `.empty-state` vocabulary (centered, `--muted` copy,
  a single `--faint` `fa-file-circle-xmark` `.empty-icon`). It replaces the usual
  "Select a document." empty copy for this case; selecting any other doc (or opening one
  from the palette) clears it. No toast, no modal — it is the empty content pane itself.
  The sidebar tree simply updates to no longer list the removed doc.

### E2 — what the user sees

- **Editing a watched doc:** save in your editor → after ~300 ms the sidebar tree
  refreshes and, if the open doc changed, its content updates in place with scroll
  preserved to the nearest heading. No spinner, no flicker of the whole app.
- **Adding/removing files:** the sidebar tree gains/loses entries automatically.
- **Deleting the doc you're reading:** the pane clears and shows
  **"This document was removed."**
- **Switching projects mid-edit:** a late reindex for the old project is dropped
  (active-id guard); nothing surprising happens in the new project.
- **On Linux:** nested changes outside the root's top level may not fire; the user
  still has the manual **Reindex** command (E4's "Reindex" / the existing rebuild).

### E2 error & edge handling

- **Watcher error / unsupported FS** (`fs.watch` throws or never fires): fail-soft —
  log, leave the project usable, manual Reindex remains. No crash, no user-facing error.
- **Rapid bursts:** the 300 ms trailing debounce with leading-edge suppression
  collapses a save-storm into one reindex.
- **Reindex after switch-away:** dropped by the `active?.id === id` guard.
- **Reindex failure:** surfaced like any rebuild failure; the prior in-memory index/
  tree is left intact (the active-project teardown only happens on a *successful*
  `selectLocal`).
- **GitHub projects:** never watched; an `index:changed` is never emitted for them.
- **Window destroyed:** the `isDestroyed()` guard on `e.sender.send` (mirroring
  `build:progress`) prevents pushing to a dead renderer; the watcher is torn down on
  window close.

### E2 testing

**Backend (bun, headless) — with a fake/mocked `fs.watch`:**
- A fired watch event triggers a reindex **once** per debounce window (leading edge
  suppressed; trailing fires after quiet); N rapid events → **1** reindex.
- The reindex reuses the `selectLocal` path and emits `index:changed` with the rebuilt
  `{ projectId, tree, docCount }`.
- **Active-id guard:** an event/reindex that resolves after the active project changed
  is a **no-op** (no push for the stale id).
- **GitHub project:** selecting one starts **no** watcher; no `index:changed`.
- **Linux degrade:** with `recursive` unsupported, a non-recursive watch is created and
  the note is logged (platform-shimmed in the test).

**Renderer (bun + jsdom, the `tests/addProjectModal.test.ts` harness):**
- `onIndexChanged` for the active project updates the tree.
- Open doc **still in tree** → stays open (re-render path), scroll-preserve invoked.
- Open doc **removed from tree** → content clears and **"This document was removed."**
  is shown.
- A push for a **non-active** project does not disturb the current view.

### E2 touch points

```
MODIFIED
  src/shared/types.ts             # IpcApi.onIndexChanged; IndexChanged payload type
  src/main/index.ts               # capture the BrowserWindow at createWindow(); wire projectService.setIndexSink() to push index:changed via the captured webContents (NOT e.sender — the watcher has no invoke event), isDestroyed guard; clear on 'closed'
  src/main/projectService.ts      # setIndexSink(); watcher lifecycle (start watch after a local selectProject, tear down on every active replacement via stopWatch) + debounced reindex; reuse selectLocal; active-id guard at the push site
  src/preload/index.ts            # onIndexChanged bridge (mirror onBuildProgress)
  src/renderer/src/App.tsx        # subscribe onIndexChanged; tree update; open-doc preserve/notice
  src/renderer/src/styles.css     # .doc-removed-notice (built on .empty-state tokens) if needed
CREATED
  src/main/watcher.ts             # fs.watch recursive + 300ms trailing/leading-suppressed debounce (injectable watch fn like clone.ts injects spawn); Linux degrade
  tests/watch.test.ts             # backend: debounce + active-id guard + github-never-watched (mocked fs.watch)
  tests/indexChanged.test.ts      # renderer: tree update + open-doc preserve/remove notice (web tsconfig)
```

---

## Cross-slice notes

- **Order dependency:** E3 ships the heading-anchor scroll-preserve restore that E2's
  silent re-render reuses; E2 must land **after** E3. E4 is independent of both and is
  sequenced second purely by risk (renderer-only, no IPC). Each PR is independently
  revertible.
- **Single new app-level key handler:** E4 introduces the first App-level `keydown`;
  it must be verified against every existing per-component Escape handler (Settings,
  TopBar, StatusBar, BranchSwitcher, ManageProjects inline rename) under the
  **topmost-surface-only** Escape rule.
- **No new dependencies anywhere** — `node:fs` for watching, a hand-rolled
  `lib/fuzzy.ts` scorer, and `localStorage` for session — consistent with the
  cannot-npm-install constraint.

## Open questions

None blocking. Palette tier 3 (cross-project GitHub docs), incremental reindex, Linux
recursive watch, and a main-side settings file are deferred by design.
