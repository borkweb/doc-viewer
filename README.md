# Curator

A desktop app for browsing, navigating, and searching documentation drawn from
local directories or GitHub repositories — one selectable **Project** at a time.

Built with Electron, React, and TypeScript. It renders Markdown (with Mermaid
diagrams and syntax highlighting), builds a full-text Section index for instant
search, and keeps local sources live via a file watcher.

## Features

- Add documentation **Projects** from a local directory or a GitHub repo
- Markdown rendering with Mermaid diagrams, code highlighting, and a navigable doc tree
- Fast full-text search across heading-delimited Sections, plus a command palette
- GitHub Projects: switch branches/tags/commits (**Refs**) and pull latest
- Local Projects: auto-reindex on file changes via a watcher
- Per-project and global theming (default theme: Cobalt Reader)

## Prerequisites

- **[Bun](https://bun.sh)** ≥ 1.3 — used for installing dependencies and running tests
- **Node.js** ≥ 20 (Node 24 tested) — Electron's runtime
- **git** — must be on your `PATH`; Curator shells out to it to clone/fetch GitHub Projects
- **macOS** for the packaged `.dmg` build target (dev mode runs cross-platform)

## Setup

```bash
bun install
```

> Dependencies are committed in `bun.lock`. If you're behind a restrictive proxy,
> some fonts/icons are already vendored under `src/renderer/src/assets/` so no
> extra network fetch is needed for them.

## Running in development

```bash
bun run dev
```

This launches `electron-vite dev` — the Electron main process plus a hot-reloading
renderer. The app window opens automatically.

## Useful scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Run the app in development with hot reload |
| `bun run build` | Type-check and build main, preload, and renderer bundles into `out/` |
| `bun run preview` | Preview the production build |
| `bun run typecheck` | Type-check both the Node (`tsconfig.node.json`) and web (`tsconfig.web.json`) projects |
| `bun test` | Run the test suite |
| `bun test --watch` | Run tests in watch mode |
| `bun run build:mac` | Build an unpacked macOS app (`--dir`, no installer) |
| `bun run dist:mac` | Build a distributable macOS `.dmg` into `dist/` |

## Building a macOS app

```bash
bun run dist:mac
```

The output `.dmg` lands in `dist/`. The build is **unsigned** (`identity: null` in
`electron-builder.yml`), so on first launch macOS may require a right-click → Open
to bypass Gatekeeper.

## How it works

Each Project runs through a pipeline (see `src/main/pipeline/`):

1. **Acquire source** — read a local directory, or `git clone`/`fetch` a GitHub repo
2. **Discover** — filter Source files down to the Documents worth surfacing
   (a top-level `docs/`/`documentation/` folder narrows the scope; see ADR-0004)
3. **Parse** — render Markdown to HTML and split each Document into Sections at H1–H3
4. **Index** — build a full-text search index over Sections
5. **Cache** — persist processed output for fast reopening

Processed output and the Project registry live in Electron's per-user data
directory (`app.getPath('userData')`):

- `projects.json` — the registered Projects
- `cache/<project-id>/<ref>/` — cached processed docs per Project and Ref

## Project layout

```
src/
  main/        Electron main process — pipeline, IPC, cache, watcher, registry
    pipeline/  acquire → discover → parse → index → build
    util/      github + path-safety helpers
  preload/     context-bridge API exposed to the renderer
  renderer/    React UI (components, render/theme/search libs, assets)
  shared/      types and helpers shared across processes
tests/         Bun test suite
```

## Documentation

- `CONTEXT.md` — domain language and core concepts (Project, Document, Ref, Theme, …)
- `DECISIONS.md` — architecture decision records (ADRs)
- `TODOS.md` — outstanding work

## License

MIT — see [LICENSE](LICENSE).
