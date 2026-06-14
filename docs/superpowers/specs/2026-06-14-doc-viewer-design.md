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
- **Local directories are read live** (always fresh) and **watched** for changes
  (auto-refresh); the cache/Rebuild path is the GitHub story. *(E2)*
- **Session memory:** remember the last-open doc + scroll position per project and
  restore on relaunch. *(E3)*
- **Command palette (⌘K):** fuzzy-jump to any project or doc. *(E4)*

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
- **marked** (markdown) + **DOMPurify** (sanitize untrusted markdown HTML),
  **mermaid** (diagrams, `securityLevel: 'strict'`), **svg-pan-zoom** (zoom/pan).
- **MiniSearch** for full-text search (small, serializable, fuzzy).
- **chokidar** for live local file-watching *(E2)*.
- **electron-builder** for a local unsigned packaged build *(distribution: run from
  source for daily use + a local `.app`/`.dmg`; no signing/notarization/auto-update
  in v1)*.
- System **git** binary via `child_process` `execFile`/`spawn` with an **argument
  array (never a shell string)**; shallow `--depth 1`, no submodule recursion,
  `GIT_TERMINAL_PROMPT=0`. Uses the user's existing SSH/credential auth for private
  repos; no extra git dependency.

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

## Review decisions (plan-deep-review, 2026-06-14)

Mode: SELECTIVE EXPANSION · Approach A + live local reads · Verdict: READY TO
IMPLEMENT (no critical gaps).

**Scope added:** E2 live file-watch (local), E3 session memory / deep-links,
E4 ⌘K command palette.

**Security (the app renders untrusted GitHub repos — these are mandatory):**
- Sanitize all marked output with **DOMPurify** before `innerHTML`.
- mermaid **`securityLevel: 'strict'`** (was `'loose'` in the existing script).
- git via **`execFile`/`spawn` arg array**, no shell; `--depth 1`, no submodules,
  `GIT_TERMINAL_PROMPT=0`.
- **Path-traversal guard** in `getDoc`: resolve `relativePath` against the project
  root and reject any escape; sanitize cache keys.
- Electron hardening: `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`, strict CSP, no `remote`.
- **Resource caps:** per-file ≤ 2 MB, ≤ 5,000 docs, skip symlinks; log every skip.

**.html handling (Issue 1 → 1A):** prefer the source `.md` and skip a same-named
generated `.html`; an orphan `.html` (no `.md` sibling) renders in a strict
**scripts-off** sandboxed iframe.

**Concurrency & cache integrity:** per-project in-memory build lock serializes
builds; Rebuild disabled while `status=building`; cache is written to a temp dir
then **atomic-renamed** so a crash never leaves a half-written cache. `manifest.json`
carries a **`cacheVersion`**; on mismatch the cache is treated as stale and
auto-rebuilt (no migration).

**Read path by type:** `Project.type` drives it — `local` reads live from disk
(and is watched), `github` reads from the cache (clone is deleted post-build).

**Observability:** rotating structured log in `userData/logs/` capturing each
pipeline stage, per-file skips with reasons, and rescued errors with full context;
in-UI build summary ("142 docs, 3 skipped, index 1.2 MB, 4.1s").

**Testing:** unit-cover every pipeline module against fixture dirs including the
adversarial cases (0 docs, oversized, binary, `../` traversal, corrupt cache,
malformed mermaid); IPC handler integration tests; RTL component tests; one
Playwright-Electron smoke (launch → add local → view → search).

**Distribution (Issue 2 → 2A):** run-from-source + electron-builder local unsigned
build. Signing/notarization/auto-update deferred (see TODOS.md / NOT in scope).

## NOT in scope

- AI documentation generation (explicitly cut — indexer/viewer only).
- In-app doc editing (read-only).
- Cross-project global search (E1) — Phase 2; needs a combined index.
- Export doc to standalone HTML (E6) — Phase 2.
- Wiki-link/backlink doc graph — future (L effort).
- Code-signing / notarization / auto-update — add only if distributed.

## Open questions

None. All review decisions above are settled.
