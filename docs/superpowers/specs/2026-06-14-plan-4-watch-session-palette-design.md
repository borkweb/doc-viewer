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
- **Scroll anchor (D4-5):** **not** a pixel offset. On scroll (throttled) and on doc
  change, compute the `id` of the nearest rendered heading at/above the `.content`
  scroll-container top and store it as `headingId`. Restore scrolls that heading into
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
callbacks `selectProject` / `openDoc` / `switchRef` / `setView` / `setAddOpen` /
`setSettingsOpen` / `rebuild`. App passes these in; the palette holds no IPC of its own.

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
| "Switch ref…" | (github active only) opens the existing ref switcher / lists refs as sub-items via `switchRef` |

Items whose action requires an active project (Documents, Reindex, Switch ref) are
**hidden** when no project is active. **Tier 3** (cross-project cached GitHub docs) is
**deferred** — it needs a new manifest-enumeration IPC.

### E4 — UI design detail

Reuses `.modal-overlay` scrim + a centered `.modal`-style panel (Cobalt Reader
`--surface`, `--border`, `--radius-lg`, `--shadow`), pinned toward the top third of the
window (palette convention), max-height with an internal scroll on the results list.

**States:**

```
OPEN (empty query)        | LOADING            | RESULTS                       | NO MATCH
--------------------------|--------------------|-------------------------------|---------------------------
search field focused;     | n/a — all data is  | grouped, scored list;         | muted empty row:
recent/default listing    | already in App     | first item highlighted        | "No matches."
(all projects + current   | state (instant).   | (keyboard-selected)           | with the .empty vocabulary
project docs + commands)  |                    |                               |
```

- **Open / empty query:** focus the search input immediately; show the full tiered
  list (Projects, then current-project Documents, then Commands) so the palette is
  useful before typing. There is **no loading state** — all data lives in renderer
  state already (instant).
- **Results:** as the user types, `lib/fuzzy.ts` scores each item by subsequence match
  against its label (and, for docs, the path); items below a threshold are dropped.
  **Ordering:** within the result set, sort by score descending; **ties broken by tier
  order** (Projects → Documents → Commands) so the grouping stays legible. Group
  headers ("Projects", "Documents", "Commands") render only for non-empty groups.
- **No match:** query matches nothing → a single muted row **"No matches."** (no Add
  CTA — distinct from a true empty registry).

**Keyboard navigation:**
- **↑ / ↓** move the highlight across the *flattened* result list (skipping group
  headers), wrapping at the ends.
- **Enter** activates the highlighted item's jump action and **closes** the palette.
- **Escape** closes the palette (precedence: palette first — see keybinding).
- Mouse hover also sets the highlight; click activates.
- Focus rings / highlight use `--accent` / `--accent-ring`.

**Verbatim copy:**

| Element | Copy |
|---------|------|
| Search placeholder | "Search projects, docs, and commands…" |
| No-match row | "No matches." |
| Group headers | "Projects" / "Documents" / "Commands" |
| Command labels | "Add project" / "Manage projects" / "Pull latest / Reindex" / "Settings" / "Switch ref…" |

**AI-slop guardrails:** no hero, no oversized icons, no gradient. Tight rows,
monospace muted doc paths (IDE feel), the same `local`/`github` chips used elsewhere,
Cobalt Reader surface/border tokens, and the existing `.modal` chrome — no new
component vocabulary.

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
- Empty query lists all projects, current-project docs, and the command set, grouped.
- Typing filters via `lib/fuzzy.ts`; a unique subsequence narrows to the expected item;
  a non-matching query shows the **"No matches."** row.
- Selecting a project item calls `selectProject(id)` and closes; a doc item calls
  `openDoc(path)`; each command label invokes its bound callback.
- Document/Reindex/Switch-ref items are hidden when no project is active.
- ↑/↓ move the highlight (skipping headers, wrapping); Enter activates the highlighted
  item.
- **Escape precedence:** with the palette over a base view, Escape closes the palette
  and does not also trigger a component-level Escape handler.
- **`lib/fuzzy.ts` unit:** subsequence match scores contiguous/prefix matches higher;
  non-subsequence returns no match.

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

**Watcher (main, D4-1):** when a **local** project becomes active, start a
`node:fs` `watch(root, { recursive: true })`. On a fired event, schedule a debounced
reindex (below). Stop/replace the watcher when the active project changes or the window
closes. **GitHub projects are never watched** (cache-backed, clone deleted).

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
- Main: `e.sender.send('index:changed', { projectId, tree, docCount })` (same
  `isDestroyed()` guard as `build:progress`).
- Preload: add `onIndexChanged(cb)` returning an unsubscribe fn (mirror
  `onBuildProgress`); add it to `IpcApi` in `src/shared/types.ts`.
- The watcher needs the active `BrowserWindow`'s `webContents` to push to — wire it
  when the window/active project is established (the watcher is owned by main, keyed to
  the active local project).

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
  clear to the empty content state and show a gentle, transient notice **"This document
  was removed."** (drawn from the `.empty-state` vocabulary). The sidebar tree simply
  updates to no longer list it.

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
  src/main/index.ts               # own/tear-down the active-project watcher with the window
  src/main/projectService.ts      # watcher lifecycle + debounced reindex; reuse selectLocal; active-id guard
  src/main/ipc.ts                 # index:changed e.sender.send wiring (mirror build:progress)
  src/preload/index.ts            # onIndexChanged bridge (mirror onBuildProgress)
  src/renderer/src/App.tsx        # subscribe onIndexChanged; tree update; open-doc preserve/notice
  src/renderer/src/styles.css     # .doc-removed-notice (built on .empty-state tokens) if needed
CREATED
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
