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
- Backend orchestration for a `docsSubpath` change: collision check → patch →
  purge cache → rebuild current ref.

**Out of scope (later plans)**
- Sortable / filterable / multi-select columns; bulk actions.
- Ref-management UI beyond the existing branch switcher (Plan 2b).
- Chrome (app-shell) theming and a full theming editor → **Plan 5**.
- File-watch, session memory, ⌘K palette → **Plan 4**.

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
- ManageProjects renders all projects with type badges.
- Rename commits `updateProjectSettings(id, { name })`.
- Theme select commits `updateProjectSettings(id, { themeId })`; `Use global`
  clears it.
- Delete calls `removeProject(id)` only after confirmation.
- docsSubpath edit on a GitHub row calls `setDocsSubpath(id, subpath)`.

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
