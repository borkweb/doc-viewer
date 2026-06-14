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
- **Session memory:** remember the last-open doc + scroll position per project (and
  the selected ref for GitHub Projects) and restore on relaunch. *(E3)*
- **Command palette (⌘K):** two-tier fuzzy jump *(E4)*. Always: all **Projects**
  (jump = switch, re-indexing local as needed) and all **Documents in the current
  Project** (jump = instant scroll). Opportunistically: **Documents from GitHub
  Projects whose manifests are already on disk** (jump = switch + open). Non-selected
  **local** Projects contribute only their Project entry, never doc-level entries
  (their index isn't kept warm — see Active-Project lifecycle). Full cross-project
  *document* search is E1 (deferred).

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

- `projects.json` — registry array. Common fields:
  `{ id, name, type: 'local' | 'github', addedAt, status }` where `id` is a
  generated UUID (never the name), `name` is a user-editable display label, and
  `status` ∈ `ok | unavailable | building | error`.
  - **local** Projects add: `source` (absolute directory path), `lastBuiltAt`,
    `docCount`.
  - **github** Projects add: `source` (normalized `https://github.com/owner/repo`
    URL), `docsSubpath?`, `refs` (array of cached refs, each
    `{ ref, lastBuiltAt, docCount }`), and `currentRef` (the selected one).
  - **Identity / dedup:** local = the absolute path; github = `(source,
    docsSubpath)` — the **ref is NOT part of identity**. Re-adding the same identity
    switches to the existing Project instead of duplicating. A GitHub Project and a
    local clone of the same repo are intentionally two Projects (different source
    types, different lifecycles — see ADR-0001).
  - **Default name** is derived (local: directory basename; github: `owner/repo`,
    plus ` /subpath` when scoped) and editable. Collisions are fine because identity
    is the UUID.
  - `source` input — Add-Project accepts a full `https` URL or the `owner/repo`
    shorthand (normalized to https). SSH-URL *input* parsing is deferred; private
    https repos still authenticate via the user's git credential helper.
  - `docsSubpath?` — optional path within the repo to scope discovery (e.g.
    `docs/`); when set, it **overrides** the docs-folder auto-scoping (ADR-0004) and
    discovery is confined to that subpath. When absent, discovery applies the
    auto-scoping rule (root-level docs + a top-level `docs/`/`documentation/` folder
    if one exists), otherwise walks the whole clone. The whole repo is cloned
    regardless (shallow); the subpath only narrows discovery.
- **Branch switcher (github only):** a GitHub Project exposes a ref switcher. Each
  ref is cached independently; switching to an already-cached ref is instant,
  switching to a new ref triggers a build (clone that ref). `currentRef` defaults to
  the repo's default branch (HEAD) on first add. "Pull latest" refreshes the
  current ref. Local Projects have no ref dimension (content is whatever is on disk).
- **Disk cache is GitHub-only**: `cache/<projectId>/<ref>/` (one cache per ref):
  - `manifest.json` — `cacheVersion`, nav tree + per-doc metadata (Title, relative
    path, headings/Sections for the TOC).
  - doc contents (markdown / html, keyed by sanitized relative path).
  - `search-index.json` — serialized per-Section MiniSearch index.
- **Local Projects persist no cache.** On project-select they discover + parse +
  build the nav tree and per-Section search index **in-memory**; the file-watcher
  (E2) keeps that state current. This avoids any drift between cached metadata and
  live content (single source of truth = the disk). `lastBuiltAt`/`docCount` in the
  registry are recomputed on each open.

The disk cache exists precisely because the GitHub clone is deleted (ADR-0001);
local Projects have no deleted source, so they need none.

### Build / rebuild pipeline (main process)

Emits progress events to the renderer over IPC so the UI can show stages.

1. **Resolve source** — local dir used in place; GitHub shallow-cloned to a temp
   dir (`os.tmpdir()`).
2. **Discover** — walk the tree for `.md` and `.html`, ignoring `node_modules`,
   `.git`, `dist`, and similar build/vendor dirs. **Docs-folder auto-scoping
   (ADR-0004):** if the root holds a top-level `docs/` or `documentation/` folder
   (case-insensitive; both included if present), discovery is scoped to root-level
   doc files **plus** those folders' subtrees, and all other root subfolders are
   excluded (not walked; one skip entry each). When no such folder exists, the walk
   covers the whole tree as above. An explicit GitHub `docsSubpath` (below)
   overrides this auto-detection.
3. **Parse** — for each doc, extract the Title (first H1) and headings (H2/H3) for
   the TOC; record the relative path; split the body into **Sections** at heading
   boundaries (H1–H3).
4. **Build nav tree** from folder structure.
5. **Build search index** — index **one MiniSearch record per Section**:
   `{ id, docPath, docTitle, headingId, headingText, depth, text }`, with markdown
   stripped to plain text for `text`. Weight `headingText`, `docTitle`, and
   `docPath` above body `text` so heading/filename matches rank above incidental
   body mentions. Content before the first heading is an intro Section anchored to
   the Document top.
6. **Write cache**; for GitHub, **delete the temp clone**.
7. **Update registry** (`lastBuiltAt`, `docCount`, `status`).

- **Add project** triggers a first build.
- **Rebuild** re-runs the full pipeline for an existing project.

### Active-Project lifecycle

Only the **selected** Project is "live." Selecting a **local** Project builds its
in-memory nav tree + Section index and starts its file-watcher; switching away
**tears both down**, freeing memory and OS watch handles; switching back re-indexes
(brief spinner). Selecting a **github** Project reads its `currentRef` cache from
disk — nothing to instantiate or tear down. On launch, E3 restores the last-selected
Project and instantiates only that one. (A warm-index LRU is a possible Phase-2
optimization if re-index latency ever matters.)

### Project mutations

- **Remove** purges the Project's disk cache (all refs) and registry entry behind a
  confirm dialog ("Remove *name*? This deletes its local cache; the original source
  is untouched."). The source directory/repo is never modified — only derived data.
- **Editable settings** (from the Manage Projects view):
  - **Name** — always editable; pure display label, no rebuild.
  - **Trusted toggle** — re-render only (skips DOMPurify / loosens mermaid for that
    Project); no rebuild. *(TODO-tracked; wiring the setting UI is in v1, behavior
    may land with the TODO.)*
  - **`docsSubpath`** (GitHub only) — editable; triggers a rebuild of the current
    ref and an identity-collision check (it is part of GitHub identity, ADR-0002).
  - **Theme** — per-Project Theme reference (default "Use global"); presentation-only,
    applied instantly, no rebuild.
  - **Ref management** stays in the branch switcher, not settings.
  - **Source path/URL is NOT editable** in v1 — re-pointing changes identity; to
    change a source, Remove the Project and Add a new one. Local Projects therefore
    expose only Name + Trusted.
- **Cancelable builds (v1):** the Add / Pull-latest modal has a Cancel that aborts
  the `git` child process and removes the temp clone. Cleanup guarantees: the temp
  clone lives in an OS temp dir removed in a `finally`; the cache is written to a
  temp dir and atomic-renamed only on success, so a crash/quit/cancel mid-build
  leaves the prior cache intact and any orphaned temp dir is swept on next launch. A
  failed or canceled Add leaves **no** registry entry.

### Renderer UI

- **Sidebar:** project dropdown + "Add project" + a Rebuild action labeled per type
  ("Pull latest" for GitHub, "Reindex" for local); a doc tree; a full-text search
  box with snippet results.
- **Doc tree:** raw folder mirror of the discovered Documents (no collapsing in v1).
  Each level is sorted **alphabetically by filename** so authors' numeric prefixes
  (`00-`, `01-`…) order naturally. Each Document is **labeled by its H1 title** when
  present, falling back to a prettified filename; the raw filename shows as a
  tooltip/subtitle. Documents are always *sorted by filename* even when *labeled by
  title*.
- **Manage Projects view:** a dedicated full-pane view (also the home/empty state
  when no Project is selected, including first run). Lists all Projects in a sortable
  table with per-row actions (open, edit settings, delete) and the Add Project entry
  point. The main pane renders either this view or a Document. Reachable from the
  dropdown ("Manage projects…") and ⌘K.
  - **Columns:** Name, Type (local/github), Source (path or `owner/repo`), Docs
    (count), Last built (current ref for github; last index time for local), Status.
  - **Sorting:** default Name ascending (case-insensitive). Sortable via header
    click on Name, Type, Docs, and Last built (Source/Status are not sortable). The
    chosen sort persists in app settings across relaunches.
- **Add-project modal:** choose *Local Directory* (native dir picker via
  `dialog.showOpenDialog`) or *GitHub URL* (text input). Shows live build
  progress: cloning → discovered N docs → indexing → done.
- **Main pane:** rendered doc with a sticky TOC and dark mode, mirroring the
  existing viewer aesthetic (purple accent; mermaid full-bleed/zoom/click-to-
  expand). `.html` docs render in a sandboxed `<iframe>`.
- **Search:** results are **per Section** (one row per matching heading-delimited
  chunk), shown as a flat ranked list with the Section's heading as the primary line
  and the Document Title + folder path as the secondary line, plus a snippet. A big
  Document yields multiple rows. Clicking a result opens the Document and scrolls to
  / highlights that Section's heading anchor.

### Theming

Themes give each Project a visually distinct look so you always know which Project
you're in.

- **Resolution / precedence:** `project theme → global theme → built-in fallback`. A
  global default theme applies app-wide; each Project may override it; the per-project
  default is **"Use global."**
- **Light/dark (hybrid):** a Theme always provides at least one palette (its `base`
  mode, light or dark) and *optionally* a second variant. If both exist, the app
  follows the OS `prefers-color-scheme` and picks the matching variant; if only one
  exists, the Theme **pins** that appearance regardless of OS mode. The built-in
  "Default" theme provides both and follows the OS (preserving today's behavior).

- **Token schema** (per light/dark variant; versioned + extensible object):
  - **Palette** — overrides for the existing renderer CSS custom properties
    (`--bg, --fg, --muted, --border, --accent, --accent-soft, --code-bg,
    --table-head, --diagram-ink, --diagram-bg`, …). Themes plug into the current
    renderer with no new styling plumbing.
  - **Content background** — image behind the Document reading area with
    `position/size/repeat`, `opacity`, `blur`, and an auto-applied **readability
    scrim** (semi-opaque layer between image and text) so body copy stays legible.
  - **Chrome background** — image behind the app chrome (sidebar + top banner), same
    knobs + scrim.
  - **Fonts deferred to Phase 2** — the theme object is versioned so adding a `fonts`
    key later is non-breaking.

- **Theme library model.** Themes are reusable named objects in a library; the
  global default and each Project reference a Theme **by id**, so editing a Theme
  updates everywhere it's used. Ship **built-in Themes**: "Default" (today's
  OS-following light/dark look) plus ~3 visually distinct seeds.
- **Custom Themes via an in-app editor (v1).** A settings form with color pickers
  bound to the palette tokens, image pickers for content/chrome backgrounds, the
  opacity/blur/scrim sliders, and a **live preview**. Stored as versioned theme
  objects in `userData/themes/*.json`.
- **Image assets copied into app data.** Picking an image copies it into
  `userData/themes/assets/` (hashed filename) so a Theme is self-contained and
  survives the source file moving.
- **Security boundary:** Theme images are always **user-provided local files, never
  sourced from a Project's repo**, and Themes are app-side config (not repo content).
  A malicious repo cannot ship or reference a Theme. Themes behave identically for
  local and GitHub Projects.

- **Selection & application.** The global default Theme is chosen in global settings;
  the per-Project Theme is a field in the Project settings form (default "Use
  global"). The registry stores `themeId?` per Project (absent = use global). Theme
  changes are **presentation-only and applied instantly** by swapping CSS custom
  properties + image layers — **never a rebuild** (Themes don't touch
  discovery/indexing). No toolbar quick-switcher in v1 (settings-only); the editor's
  live preview covers "try before committing."

### IPC API (preload `window.api`)

- `listProjects(): Project[]`
- `addProject({ type, source, name?, ref?, docsSubpath? }): Project` — triggers a build
- `removeProject(id): void` — purges cache (all refs) + registry entry
- `updateProjectSettings(id, { name?, trusted?, docsSubpath?, themeId? }): Project` —
  `docsSubpath` change triggers a rebuild + collision check; others are instant
- `rebuildProject(id): void` — "Pull latest" (github) / "Reindex" (local)
- `cancelBuild(id): void` — abort in-flight clone/build, clean up temp
- `listRefs(id): RefInfo[]` / `switchRef(id, ref): void` / `addRef(id, ref): void` /
  `removeRef(id, ref): void` — github branch switcher
- `getProjectTree(id): NavTree`
- `getDoc(id, relativePath): { kind: 'md' | 'html', content: string }`
- `search(id, query): SearchResult[]` — per-Section results
- `getSettings() / setSettings({ globalThemeId?, projectSort? })` — app-global config
- `listThemes() / saveTheme(theme) / deleteTheme(id)` — theme library CRUD
- `pickDirectory(): string | null` — native dir picker
- `pickThemeImage(): string | null` — native file picker; copies into
  `userData/themes/assets/` and returns the hashed asset ref
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
  **`bun test`** (bun's native runner) against fixture directories.
- The renderer's DOM-dependent test (`render.ts` sanitization + heading-slug
  parity) runs under **jsdom** globals, registered for all tests via a global
  preload (`bunfig.toml` → `tests/setup-dom.ts`). jsdom is used rather than
  happy-dom because happy-dom does not implement the NodeIterator removal steps
  DOMPurify relies on, which would let `<script>` tags slip through sanitization.
- IPC handlers tested by calling the underlying functions directly.

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

**Scope added (deep-review):** E2 live file-watch (local), E3 session memory /
deep-links, E4 ⌘K command palette.

**Scope added (grill-with-docs):** GitHub branch switcher (ADR-0002), per-Section
search, in-memory local indexing, active-Project teardown, cancelable builds, the
**Manage Projects view** (sortable table, editable settings, delete), and
**Theming** (global + per-Project, palette + background images, in-app editor;
app-side per ADR-0003). See `CONTEXT.md` for the domain glossary and `docs/adr/` for
0001–0003.

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
