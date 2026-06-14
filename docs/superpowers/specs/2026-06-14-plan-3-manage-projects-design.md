# Plan 3 — Manage Projects View (Design)

**Status:** Approved design, pending implementation plan.
**Parent spec:** `docs/superpowers/specs/2026-06-14-doc-viewer-design.md`
**Predecessors:** Plan 1 (core local viewer), Plan 2a/2b (GitHub projects backend + UI).

## Goal

Give the user a dedicated surface to manage the projects in the registry: rename
them, delete them (purging derived cache), change a GitHub project's docs subpath
(re-scoping what is indexed), and set a per-project document-theme override. This
also surfaces two capabilities that are wired through IPC today but have **no
renderer caller** — `removeProject` and `updateProjectSettings` — and closes the
one piece Plan 2 explicitly deferred: a `docsSubpath` change that re-scopes
identity, checks for collisions, and rebuilds.

## Scope

**In scope**
- A full-content **Manage Projects view** (not a modal) reachable from the top bar.
- Per-row actions: **Rename**, **Delete** (confirm + cache purge), **Edit
  docsSubpath** (GitHub only; rebuild + identity-collision check), **Per-project
  theme** override (document pane only).
- **Sort & filter** the list (client-side): a filter box (matches name + source)
  and a sort control (Name / Type / Recently built).
- Backend orchestration for a `docsSubpath` change: collision check → patch →
  purge cache → rebuild current ref.

**Out of scope (later plans)**
- Multi-select rows & bulk actions (the list does single-row actions only).
- Ref-management UI beyond the existing branch switcher (Plan 2b).
- Chrome (app-shell) theming and a full theming editor → **Plan 5**.
- File-watch, session memory, ⌘K palette → **Plan 4**.

**Design decisions considered and deferred (from design review)**
- Hover/focus-revealed row controls — rejected for discoverability + keyboard a11y; controls are always visible.
- Modal delete confirmation — rejected in favor of an inline two-step confirm (lighter, no dialog stacking).
- Segmented per-row theme control — rejected for row density; a compact select is used.
- Responsive / touch layouts — N/A (single fixed Electron window).

## What already exists (reuse, don't reinvent)

- **Design system:** the `design-system` skill (Curator "Cobalt Reader" theme) + `styles.css` tokens (`--surface`, `--surface-alt`, `--border`, `--muted`, `--faint`, `--accent`, `--accent-ring`, `--radius-*`, `--space-*`, `--text-*`).
- **`.empty-state` / `.empty-icon`** — reuse verbatim for the first-run state.
- **`.segmented`** (Settings) — the theme-choice vocabulary; the row uses a compact select variant of the same options.
- **`.icon-button`** (TopBar) — all row action controls and the Manage toggle.
- **`.field` / `.add-error`** and the `onBuildProgress` busy pattern (AddProjectModal) — the docsSubpath editor and inline rebuild progress.
- **Top-bar / StatusBar chrome** — the Manage toggle sits in the existing top bar; no new chrome surface.

## Architecture

### 1. Navigation / App state

`App` gains a `view: 'docs' | 'manage'` state. A new top-bar icon button (beside
the project dropdown / add button) switches to `manage`. When `view === 'manage'`
the content area renders `<ManageProjects>` instead of `DocView`/empty-state, and
the sidebar is hidden (reuse the existing `no-sidebar` body class). Exiting:
selecting a project from the list **or** the project dropdown returns to `docs`
and selects that project; a **Done** affordance in the view also returns to `docs`
without changing the active project.

*Alternative considered:* a client-side router. Rejected — no router exists today;
a mode flag matches the current App-as-controller pattern and is far less code.

### 2. ManageProjects component

`src/renderer/src/components/ManageProjects.tsx` — a table/list of all projects,
ordered alphabetically by name. Each row shows: display name, a `local` / `github`
type badge, the source path or repository URL, and a doc/ref count. A controls
cluster per row:

- **Rename** — inline edit committing to `updateProjectSettings(id, { name })`.
- **Per-project theme** — a small segmented control (`Use global` / `Dark` /
  `Light` / `System`) committing to `updateProjectSettings(id, { themeId })`.
  `Use global` clears the override (`themeId` absent).
- **docsSubpath** (GitHub rows only) — an editable field; committing calls
  `setDocsSubpath` (below), shows inline build progress via `onBuildProgress`, and
  surfaces a collision error inline without mutating the project.
- **Delete** — explicit confirmation, then `removeProject(id)` (the existing IPC
  handler already purges the derived cache; for GitHub that is all refs).

New `.manage-*` styles built on existing design-system tokens (`--surface`,
`--border`, `--accent`, `--muted`, `--radius-*`, `--space-*`).

### 3. Backend — docsSubpath change

New `projectService.setDocsSubpath(id, subpath, onProgress, deps)`:

1. Resolve the project; reject if not a GitHub project.
2. Normalize the new subpath; compute `githubIdentity(source, subpath)`. If a
   **different** project already has that identity, throw a collision error and
   make **no** change.
3. Patch `docsSubpath` in the registry (via `updateProject`).
4. Purge the project's cache (all refs — the subpath changes what discovery finds)
   and rebuild `currentRef`, recording the result with `recordRef`.
5. Return the rebuilt `{ tree, docCount }`; if the project is the active one, the
   caller refreshes the tree.

A no-op change (same normalized subpath) returns early without a rebuild.

IPC: `projects:setDocsSubpath` handler that streams progress (same pattern as
`projects:switchRef` / `projects:rebuild`). Preload: `setDocsSubpath(id, subpath)`.
Rename and theme continue through the existing `updateProjectSettings`; delete
through the existing `removeProject`.

### 4. Per-project theme resolution

`themeId` already exists on `ProjectBase` (currently typed `string`; narrow to
`ThemeChoice`). `App` resolves the **document** pane theme as
`activeProject?.themeId ?? theme.document` (chrome theme stays global — the full
theming editor is Plan 5). The Manage view writes it via `updateProjectSettings`.
When a project with an override becomes active, the document pane reflects it; the
global Settings document theme remains the fallback.

## UI design detail (from design review)

### Row layout & hierarchy

The view is a vertical **list of rows** (not a columnar table — GitHub rows carry an
extra control that breaks a rigid grid), scrolling within the content area. A header
bar holds the title **"Manage Projects"** (left), then a **filter box** and a
**sort select**, and a **"Done"** button (right). Each row, left → right:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Manage Projects        [ Filter projects… ]  [Sort: Name ▾]        [ Done ]│
├──────────────────────────────────────────────────────────────────────────┤
│ Curator Docs              ~/code/curator/docs       ⟨local⟩  12 docs       │
│                                         ✎  [Theme: Global ▾]            🗑  │
│ react/react.dev           github.com/react/react.dev ⟨github⟩ 3 branches   │
│                            docs subpath: ▢ docs      ✎  [Theme: Dark ▾]  🗑 │
└──────────────────────────────────────────────────────────────────────────┘
   name (primary)  ·  source (muted, mono, mid-trunc)  ·  chip + count  ·  controls
```

Each row, left → right:

- **Name** — primary; semibold, `--text-base`.
- **Source** — secondary; `--muted`, monospace, **middle-truncated** (on-disk path
  for local, repo URL for github).
- **Type chip** — tertiary; a small non-interactive `local` / `github` chip
  (`--surface-alt` background).
- **Count** — tertiary; `{n} docs` (local) or `{n} branches` (github).
- **Controls cluster** — right-aligned, **always visible** (decision): rename,
  per-project theme select, docsSubpath (github only), delete.

Rows sit on `--surface` with a `--border` divider and hover-lift to `--surface-alt`.

### Interaction states

```
FEATURE          | LOADING          | EMPTY            | ERROR                       | SUCCESS
-----------------|------------------|------------------|-----------------------------|----------------------
Project list     | instant (local)  | first-run CTA    | —                           | rows render
Rename           | —                | —                | empty → falls back to prior | inline value updates
docsSubpath edit | row busy + prog. | —                | inline collision / 0-doc    | row count updates
Delete           | row busy         | → empty-state    | —                           | row collapses out
```

- **Empty / first-run:** zero projects → reuse `.empty-state` (folder icon), copy
  "No projects yet — add one to get started.", and a primary **Add project** button
  that opens the existing Add-Project modal.
- **List load:** instant local registry read — no skeleton/spinner.
- **Rename:** click rename (or the name) → inline input seeded with the current
  name; Enter / blur commits via `updateProjectSettings`, Escape cancels; a blank
  input falls back to the prior name (never empty).
- **docsSubpath edit (github):** inline field; commit calls `setDocsSubpath`, the
  row goes busy (controls disabled, inline progress from `onBuildProgress`); a
  collision or 0-doc result shows an inline message and keeps the field open.
- **Delete (inline two-step):** Delete → the controls morph to
  "Delete \<name\>? [Cancel] [Delete]"; confirming calls `removeProject` and the row
  collapses + fades out.
- **During an in-flight build:** while a project's `status === 'building'`, that
  row's controls are disabled and show progress — no edit/delete until it settles.

### Sort & filter

- **Filter box** in the header (`.field`-styled input, placeholder "Filter
  projects…"): live, case-insensitive substring match against **name + source**.
  Clearing it restores the full list.
- **Sort select** ("Sort: Name ▾"): **Name** (default, locale-aware), **Type**
  (local before github, then name), **Recently built** (most-recent `lastBuiltAt`
  for local / newest ref `lastBuiltAt` for github, descending). Sorting is stable
  and client-side.
- **Filtered-to-empty** (query matches nothing, but projects exist) is distinct
  from first-run: show an inline "No projects match \"\<query\>\"." with a
  **Clear filter** action — not the first-run Add CTA.

### Deleting the active project (edge case)

If the deleted project is the active one, clear `activeId` / tree / `docPath`; the
row collapses out and the user remains in the Manage view. Pressing **Done** with no
active project shows the standard content empty-state.

### Per-project theme control

A compact select per row — **"Theme: Global ▾"** with options Global / Dark / Light
/ System. "Global" clears `themeId`; the others set it. Applies to the **document**
pane only.

### Motion

- Row removal: collapse height + fade, 200 ms ease-out.
- Inline rename / delete-confirm morph: 100 ms ease-out.
- All gated by `prefers-reduced-motion: reduce` → instant state change, no animation.
- No decorative-only motion.

### Keyboard & focus

- The Manage toggle, rows, and every control are tab-reachable in DOM order; focus
  rings reuse `--accent-ring`.
- Inline rename: Enter commits, Escape cancels. Delete confirm: Escape cancels.
- Single fixed Electron window — responsive / touch layouts are not in scope.

### Verbatim copy

| Element                | Copy                                                    |
|------------------------|---------------------------------------------------------|
| Toggle tooltip / aria  | "Manage projects"                                       |
| View header            | "Manage Projects"                                       |
| Exit button            | "Done"                                                   |
| Empty state            | "No projects yet — add one to get started." + "Add project" |
| Filter placeholder     | "Filter projects…"                                      |
| Sort select            | "Sort: Name" / "Sort: Type" / "Sort: Recently built"    |
| No filter match        | "No projects match \"\<query\>\"." + "Clear filter"     |
| Rename placeholder     | (current name)                                          |
| docsSubpath placeholder| "docs subpath (e.g. docs)"                              |
| docsSubpath collision  | "Another project already uses that repo + subpath."     |
| docsSubpath 0-doc note | "No docs found at that subpath."                        |
| Delete confirm         | "Delete \<name\>?" + "Cancel" / "Delete"                |
| Count                  | "{n} docs" (local) / "{n} branches" (github)            |
| Type chips             | "local" / "github"                                      |

### AI-slop guardrails

What keeps this from a generic SaaS table: monospace middle-truncated paths (IDE
feel), subtle non-interactive type chips, controls drawn from the existing top-bar
`icon-button` set, the theme select matching app chrome, and Cobalt Reader
surface/border tokens — no new component vocabulary, no card grid, no hero.

## Data flow

```
Manage view (renderer)
  rename / theme  → window.api.updateProjectSettings(id, patch) → registry.updateProject
  docsSubpath     → window.api.setDocsSubpath(id, subpath)
                      → projectService.setDocsSubpath
                          → identity collision check (registry)
                          → updateProject(docsSubpath)
                          → purgeProjectCache + buildGithubRef(currentRef) + recordRef
                      ← { tree, docCount }   (+ build:progress stream)
  delete          → window.api.removeProject(id) → purgeProjectCache + registry.removeProject
App
  refreshProjects() after every mutation; re-select / refresh tree as needed
  docTheme = resolveTheme(activeProject?.themeId ?? theme.document, systemDark)
```

## Error handling

- **docsSubpath collision** → inline error in the editor; project unchanged.
- **docsSubpath rebuild failure** → surface the error; prior cache is left intact
  by the atomic cache write (a failed rebuild does not destroy the old ref).
- **Delete** → explicit confirmation before removal; no undo.
- Build progress and busy state reuse the `onBuildProgress` subscription.

## Testing

**Backend (bun, headless)**
- `setDocsSubpath` collision: a second project with the target identity → throws,
  registry unchanged.
- `setDocsSubpath` success: identity/docsSubpath updated, cache rebuilt to the new
  scope (old-scope docs no longer present), returns the new tree/docCount.
- `setDocsSubpath` rejects a non-GitHub project; no-op on an unchanged subpath.

**Renderer (jsdom via `react-dom/client`, the Plan 2b harness)**
- ManageProjects renders all projects with `local` / `github` type chips.
- Zero projects renders the first-run empty-state with an "Add project" button.
- Rename commits `updateProjectSettings(id, { name })`; a blank rename falls back
  to the prior name (no empty-name update is sent).
- Theme select commits `updateProjectSettings(id, { themeId })`; `Global` clears it.
- Delete is two-step: `removeProject` is **not** called until the inline confirm.
- docsSubpath edit on a GitHub row calls `setDocsSubpath(id, subpath)`.
- A project with `status === 'building'` renders its row controls disabled.
- Filter narrows the list (name + source match); a non-matching query shows the
  "No projects match" inline state with a Clear filter action.
- Sort by Type / Recently built reorders rows as specified.

## Touch points

```
MODIFIED
  src/shared/types.ts            # themeId narrowed to ThemeChoice; IpcApi.setDocsSubpath
  src/main/projectService.ts     # setDocsSubpath orchestration
  src/main/registry.ts           # identity-collision helper (reuse githubIdentity)
  src/main/ipc.ts                # projects:setDocsSubpath handler (streams progress)
  src/preload/index.ts           # setDocsSubpath bridge method
  src/renderer/src/App.tsx       # view mode, manage wiring, per-project doc theme
  src/renderer/src/components/TopBar.tsx   # "Manage projects" toggle button
  src/renderer/src/styles.css    # .manage-* styles
CREATED
  src/renderer/src/components/ManageProjects.tsx
  tests/manageProjects.test.ts          # renderer (web tsconfig)
  tests/setDocsSubpath.test.ts          # backend
```

## Open questions

None blocking. Sortable columns and richer ref management are deferred by design.
