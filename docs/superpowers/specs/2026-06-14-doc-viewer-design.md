# Doc Viewer (Electron) — Design

**Date:** 2026-06-14
**Status:** Approved

## Summary

A cross-platform Electron desktop app for browsing project documentation. The
user selects a **project** from a nav dropdown — or adds a new one — where a
project is either a **local directory** or a **GitHub repository**. On add (and
on demand via **Rebuild**), the app processes the project's docs into a cached,
navigable, full-text-searchable view.

It reuses the rendering approach from the existing single-file viewer in
`../mews-two/docs` (`scripts/build-db-html.mjs`): `marked` for markdown,
`mermaid` for diagrams (zoomable / click-to-expand via `svg-pan-zoom`), a sticky
table of contents, and a dark-mode aesthetic with a purple accent.

## Goals

- Add, list, select, and remove projects from the nav.
- Project source = local directory **or** GitHub repo (public or private).
- Discover and view existing docs (`.md` and pre-rendered `.html`). **No AI
  generation** — this is an indexer/viewer.
- **Full-text search across all docs** in the selected project; jump to matches.
- **Rebuild** a project on demand to refresh its cached docs/index.
- GitHub repos are **cloned only to read/process docs, then the clone is
  deleted**; the processed result is cached so viewing works offline.

## Non-Goals

- Generating documentation from source code (no AI generation).
- Editing docs in-app.
- Real-time file watching / auto-refresh (refresh is the explicit Rebuild action).

## Architecture (Approach A: pipeline + cache)

The main process does all Node work and writes a per-project processed cache; the
renderer views from that cache. This satisfies every constraint cleanly (offline
viewing, GitHub clone deleted after build) while reusing the existing rendering
code.

### Tech stack

- **Electron** (latest) + **React 19** + **TypeScript**.
- **electron-vite** for the main / preload / renderer build (Vite + React + TS).
- **marked** (markdown), **mermaid** (diagrams), **svg-pan-zoom** (zoom/pan).
- **MiniSearch** for full-text search (small, serializable, fuzzy).
- System **git** binary via `child_process` (shallow `--depth 1` clone). Uses the
  user's existing SSH/credential auth for private repos; no extra git dependency.

### Process model

- **Main (Node):** project registry, build pipeline, cache management, IPC.
- **Preload:** `contextBridge` exposes a typed `window.api`; the renderer gets no
  direct Node access (`contextIsolation: true`, `nodeIntegration: false`).
- **Renderer (React):** the UI shell.

### Storage (Electron `userData`)

- `projects.json` — registry array of:
  `{ id, name, type: 'local' | 'github', source, addedAt, lastBuiltAt, docCount, status }`
  where `status` ∈ `ok | unavailable | building | error`.
- `cache/<projectId>/`:
  - `manifest.json` — nav tree + per-doc metadata (title, relative path, headings
    for the TOC).
  - doc contents (markdown / html, keyed by sanitized relative path).
  - `search-index.json` — serialized MiniSearch index.

The cache is what lets GitHub docs render after the temp clone is deleted.

### Build / rebuild pipeline (main process)

Emits progress events to the renderer over IPC so the UI can show stages.

1. **Resolve source** — local dir used in place; GitHub shallow-cloned to a temp
   dir (`os.tmpdir()`).
2. **Discover** — walk the tree for `.md` and `.html`, ignoring `node_modules`,
   `.git`, `dist`, and similar build/vendor dirs.
3. **Parse** — for each doc, extract the title (first H1) and headings (H2/H3) for
   the TOC; record the relative path.
4. **Build nav tree** from folder structure.
5. **Build search index** — MiniSearch over `{ title, path, content }`, with
   markdown stripped to plain text for the `content` field.
6. **Write cache**; for GitHub, **delete the temp clone**.
7. **Update registry** (`lastBuiltAt`, `docCount`, `status`).

- **Add project** triggers a first build.
- **Rebuild** re-runs the full pipeline for an existing project.

### Renderer UI

- **Sidebar:** project dropdown + "Add project" + "Rebuild" buttons; a doc tree
  (folders/files); a full-text search box with snippet results.
- **Add-project modal:** choose *Local Directory* (native dir picker via
  `dialog.showOpenDialog`) or *GitHub URL* (text input). Shows live build
  progress: cloning → discovered N docs → indexing → done.
- **Main pane:** rendered doc with a sticky TOC and dark mode, mirroring the
  existing viewer aesthetic (purple accent; mermaid full-bleed/zoom/click-to-
  expand). `.html` docs render in a sandboxed `<iframe>`.
- **Search:** clicking a result opens the doc and scrolls to / highlights the
  match.

### IPC API (preload `window.api`)

- `listProjects(): Project[]`
- `addProject({ type, source, name? }): Project` — triggers a build
- `removeProject(id): void`
- `rebuildProject(id): void`
- `getProjectTree(id): NavTree`
- `getDoc(id, relativePath): { kind: 'md' | 'html', content: string }`
- `search(id, query): SearchResult[]`
- `pickDirectory(): string | null` — native dir picker
- `onBuildProgress(cb)` — streamed pipeline progress events

## Error handling

- **Clone failures** (bad URL, auth, network) — surfaced in the add/rebuild modal
  with the git error; project marked `error`.
- **Local dir moved/deleted** — project marked `unavailable`, with rebuild/remove
  options.
- **Malformed mermaid** — inline render error in the doc (existing behavior).
- **Empty project** (no docs found) — friendly empty state; build still succeeds
  with `docCount: 0`.

## Testing

- Pipeline modules (discover, parse, index-build) are pure Node → unit-tested with
  **vitest** against fixture directories.
- IPC handlers tested by calling the underlying functions directly.
- Light React component tests (React Testing Library) optional for Sidebar /
  search interactions.

## Project layout

```
doc-viewer/
  package.json
  electron.vite.config.ts
  src/
    main/
      index.ts          # app/window lifecycle
      registry.ts       # projects.json read/write
      ipc.ts            # IPC handler registration
      pipeline/
        clone.ts        # github shallow clone + cleanup
        discover.ts     # tree walk, file filtering
        parse.ts        # title/headings extraction
        index.ts        # MiniSearch build + serialize
        build.ts        # orchestrates the pipeline, emits progress
      cache.ts          # per-project cache read/write
    preload/
      preload.ts        # typed window.api via contextBridge
    renderer/
      App.tsx
      components/
        Sidebar.tsx
        DocTree.tsx
        SearchBox.tsx
        DocView.tsx
        AddProjectModal.tsx
      lib/
        render.ts       # marked + mermaid + svg-pan-zoom (ported from existing script)
  docs/superpowers/specs/2026-06-14-doc-viewer-design.md
```

## Open questions

None blocking. Defaults chosen: MiniSearch for search, system git for cloning,
electron-vite for scaffolding, sandboxed iframe for `.html` docs.
