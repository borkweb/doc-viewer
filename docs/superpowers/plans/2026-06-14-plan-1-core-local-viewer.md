# Plan 1 — Core Foundation + Local Viewer (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable Electron desktop app that lets you add a local directory as a Project, browse its markdown/HTML docs in a navigable tree, read them rendered (markdown + mermaid), and search across them per-Section.

**Architecture:** Electron main process (Node) owns all filesystem work — a pipeline that discovers docs, parses them into Sections, and builds an in-memory MiniSearch index — and exposes it to the React renderer over a typed, context-isolated IPC bridge. The renderer is a pure view: sidebar (project selector + doc tree + search) and a content pane that renders markdown with DOMPurify-sanitized HTML, strict-mode mermaid, and zoomable diagrams. This plan is **local-only** (no GitHub, no disk cache, no theming — those are later plans); local Projects build their index in-memory on select.

**Tech Stack:** Electron, electron-vite, React 19, TypeScript, Vite, marked, DOMPurify, mermaid, svg-pan-zoom, MiniSearch, Vitest, @testing-library/react, jsdom.

**Spec:** `docs/superpowers/specs/2026-06-14-doc-viewer-design.md` · **Glossary:** `CONTEXT.md` · **ADRs:** `docs/adr/0001` (read paths).

---

## File Structure

```
package.json                         # deps + scripts
electron.vite.config.ts              # main/preload/renderer build
tsconfig.json / tsconfig.node.json / tsconfig.web.json
vitest.config.ts                     # unit + component test config
src/
  shared/
    types.ts                         # Project, Document, Section, NavTree, SearchResult, IpcApi
  main/
    index.ts                         # app + BrowserWindow lifecycle, security
    paths.ts                         # userData path helpers
    registry.ts                      # projects.json CRUD (local projects)
    projectService.ts                # active-project in-memory state + build orchestration
    ipc.ts                           # registers IPC handlers
    util/
      pathsafe.ts                    # safe relative-path resolution (traversal guard)
    pipeline/
      discover.ts                    # walk dir → Document list (filter/caps/dedup)
      parse.ts                       # title + headings + Sections
      index.ts                       # MiniSearch per-Section build + query
  preload/
    index.ts                         # contextBridge → window.api
  renderer/
    index.html
    src/
      main.tsx                       # React entry
      App.tsx                        # shell + state
      components/
        Sidebar.tsx
        DocTree.tsx
        DocView.tsx
        SearchBox.tsx
      lib/
        render.ts                    # marked + DOMPurify + mermaid + svg-pan-zoom + TOC
tests/
  fixtures/sample-docs/...           # sample markdown tree for pipeline tests
  discover.test.ts
  parse.test.ts
  index.test.ts
  pathsafe.test.ts
  registry.test.ts
  projectService.test.ts
  render.test.ts
```

---

### Task 1: Project scaffold (electron-vite + React 19 + TS)

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "doc-viewer",
  "version": "0.1.0",
  "description": "Desktop viewer for local and GitHub documentation",
  "license": "MIT",
  "author": "Matthew Batchelder",
  "main": "./out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck:node": "tsc -p tsconfig.node.json --noEmit",
    "typecheck:web": "tsc -p tsconfig.web.json --noEmit",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "dompurify": "^3.2.4",
    "marked": "^12.0.2",
    "mermaid": "^11.4.1",
    "minisearch": "^7.1.1",
    "svg-pan-zoom": "^3.6.2"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^33.2.1",
    "electron-vite": "^2.3.0",
    "jsdom": "^25.0.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.7.2",
    "vite": "^5.4.11",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
out/
dist/
*.log
.DS_Store
```

- [ ] **Step 4: Create `electron.vite.config.ts`**

```ts
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/preload/index.ts') } } }
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } },
    plugins: [react()]
  }
})
```

- [ ] **Step 5: Create the three tsconfig files**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] }
  },
  "include": ["src/main", "src/preload", "src/shared", "tests", "electron.vite.config.ts", "vitest.config.ts"]
}
```

`tsconfig.web.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] }
  },
  "include": ["src/renderer/src", "src/shared"]
}
```

- [ ] **Step 6: Create the minimal main process `src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 7: Create the minimal preload `src/preload/index.ts`**

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {
  ping: () => 'pong'
})
```

- [ ] **Step 8: Create the renderer entry files**

`src/renderer/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'" />
    <title>Doc Viewer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/main.tsx`:
```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

`src/renderer/src/App.tsx`:
```tsx
export default function App(): React.JSX.Element {
  return <h1>Doc Viewer</h1>
}
```

- [ ] **Step 9: Run the app to verify the scaffold boots**

Run: `npm run dev`
Expected: an Electron window opens showing "Doc Viewer". Close it (Ctrl-C in terminal).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(scaffold): electron-vite + React 19 + TS app shell"
```

---

### Task 2: Vitest setup

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/render.test.ts', 'jsdom']],
    include: ['tests/**/*.test.ts']
  }
})
```

- [ ] **Step 2: Write a trivial smoke test `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: add vitest config and smoke test"
```

---

### Task 3: Shared types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Write `src/shared/types.ts`**

```ts
// Discovered viewable file kinds.
export type DocKind = 'md' | 'html'

// A node in the navigation tree (folder or document).
export interface NavFolder {
  type: 'folder'
  name: string
  path: string // relative path of the folder from the project root
  children: NavNode[]
}
export interface NavDoc {
  type: 'doc'
  name: string // filename, e.g. "03-domain-model.md"
  title: string // H1 or prettified filename
  path: string // relative path from the project root
  kind: DocKind
}
export type NavNode = NavFolder | NavDoc

// A heading-delimited chunk of a Document — the unit of search.
export interface Section {
  id: string // `${docPath}#${headingId}` (stable per doc)
  docPath: string
  docTitle: string
  headingId: string // slug anchor, '' for the intro section
  headingText: string // '' for the intro section
  depth: number // 1..3, 0 for intro
  text: string // markdown-stripped plain text of the section body
}

// A parsed Document with its metadata and sections.
export interface ParsedDoc {
  path: string // relative from project root
  name: string
  kind: DocKind
  title: string
  sections: Section[]
}

// Persisted project record (local-only in this plan).
export type ProjectStatus = 'ok' | 'unavailable' | 'building' | 'error'
export interface Project {
  id: string // UUID
  name: string // editable display label
  type: 'local' // github added in a later plan
  source: string // absolute directory path
  addedAt: string // ISO timestamp
  lastBuiltAt?: string
  docCount?: number
  status: ProjectStatus
}

// A search hit (per Section).
export interface SearchResult {
  docPath: string
  docTitle: string
  headingId: string
  headingText: string
  snippet: string
  score: number
}

// The typed surface exposed on window.api by the preload bridge.
export interface IpcApi {
  listProjects(): Promise<Project[]>
  addLocalProject(source: string, name?: string): Promise<Project>
  removeProject(id: string): Promise<void>
  selectProject(id: string): Promise<{ tree: NavNode[]; docCount: number }>
  getDoc(id: string, relativePath: string): Promise<{ kind: DocKind; content: string }>
  search(id: string, query: string): Promise<SearchResult[]>
  pickDirectory(): Promise<string | null>
}

declare global {
  interface Window {
    api: IpcApi
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(types): shared domain + IPC types"
```

---

### Task 4: `discover` — walk a directory into a Document list

**Files:**
- Create: `src/main/pipeline/discover.ts`
- Create: `tests/discover.test.ts`
- Create fixtures: `tests/fixtures/sample-docs/` (see Step 1)

**Behavior (from spec):** walk the tree for `.md` and `.html`; ignore `node_modules`, `.git`, `dist`, `build`, `out`, `vendor`, `coverage`; skip symlinks; cap per-file size at 2 MB and total docs at 5000 (log skips); prefer the source `.md` and skip a same-named generated `.html` (1A); orphan `.html` (no `.md` sibling) is kept.

- [ ] **Step 1: Create fixtures**

Create these files with any short markdown/text content:
```
tests/fixtures/sample-docs/README.md                 # "# Readme\n\nhello"
tests/fixtures/sample-docs/01-intro.md               # "# Intro\n\n## Goals\n\ntext"
tests/fixtures/sample-docs/guide/02-setup.md         # "# Setup\n\ndetails"
tests/fixtures/sample-docs/db.md                      # "# Database\n\nschema"
tests/fixtures/sample-docs/db.html                    # "<h1>Database</h1>" (generated sibling — should be skipped)
tests/fixtures/sample-docs/standalone.html            # "<h1>Standalone</h1>" (orphan — should be kept)
tests/fixtures/sample-docs/node_modules/ignored.md   # "# Nope" (must be ignored)
```

- [ ] **Step 2: Write the failing test `tests/discover.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { discover } from '../src/main/pipeline/discover'

const root = resolve('tests/fixtures/sample-docs')

describe('discover', () => {
  it('finds markdown and orphan html, ignoring vendor dirs', async () => {
    const docs = await discover(root)
    const paths = docs.map((d) => d.path).sort()
    expect(paths).toContain('README.md')
    expect(paths).toContain('01-intro.md')
    expect(paths).toContain('guide/02-setup.md')
    expect(paths).toContain('db.md')
    expect(paths).toContain('standalone.html')
  })

  it('skips a generated .html when a same-named .md exists (1A)', async () => {
    const docs = await discover(root)
    const paths = docs.map((d) => d.path)
    expect(paths).not.toContain('db.html')
  })

  it('ignores node_modules', async () => {
    const docs = await discover(root)
    const paths = docs.map((d) => d.path)
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false)
  })

  it('tags kind correctly', async () => {
    const docs = await discover(root)
    expect(docs.find((d) => d.path === 'db.md')!.kind).toBe('md')
    expect(docs.find((d) => d.path === 'standalone.html')!.kind).toBe('html')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/discover.test.ts`
Expected: FAIL ("Cannot find module '../src/main/pipeline/discover'").

- [ ] **Step 4: Implement `src/main/pipeline/discover.ts`**

```ts
import { readdir, lstat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { DocKind } from '@shared/types'

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'vendor', 'coverage'
])
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_DOCS = 5000

export interface DiscoveredDoc {
  path: string // relative, posix-style separators
  kind: DocKind
}
export interface DiscoverResult {
  docs: DiscoveredDoc[]
  skipped: { path: string; reason: string }[]
}

function toPosix(p: string): string {
  return p.split(sep).join('/')
}

export async function discoverDetailed(root: string): Promise<DiscoverResult> {
  const found: { abs: string; rel: string; kind: DocKind; size: number }[] = []
  const skipped: { path: string; reason: string }[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (err) {
      skipped.push({ path: toPosix(relative(root, dir)), reason: `readdir failed: ${(err as Error).message}` })
      return
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        skipped.push({ path: toPosix(relative(root, abs)), reason: 'symlink skipped' })
        continue
      }
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue
        await walk(abs)
        continue
      }
      if (!entry.isFile()) continue
      const lower = entry.name.toLowerCase()
      const kind: DocKind | null = lower.endsWith('.md') ? 'md' : lower.endsWith('.html') ? 'html' : null
      if (!kind) continue
      const stat = await lstat(abs)
      if (stat.size > MAX_FILE_BYTES) {
        skipped.push({ path: toPosix(relative(root, abs)), reason: `oversized (${stat.size} bytes)` })
        continue
      }
      found.push({ abs, rel: toPosix(relative(root, abs)), kind, size: stat.size })
    }
  }

  await walk(root)

  // 1A: drop a .html when a same-named .md sibling exists.
  const mdSet = new Set(found.filter((f) => f.kind === 'md').map((f) => f.rel.replace(/\.md$/i, '')))
  const deduped = found.filter((f) => {
    if (f.kind === 'html') {
      const base = f.rel.replace(/\.html$/i, '')
      if (mdSet.has(base)) {
        skipped.push({ path: f.rel, reason: 'generated html shadowed by .md sibling' })
        return false
      }
    }
    return true
  })

  const capped = deduped.slice(0, MAX_DOCS)
  if (deduped.length > MAX_DOCS) {
    skipped.push({ path: '(many)', reason: `doc count capped at ${MAX_DOCS} (had ${deduped.length})` })
  }

  return {
    docs: capped.map((f) => ({ path: f.rel, kind: f.kind })),
    skipped
  }
}

export async function discover(root: string): Promise<DiscoveredDoc[]> {
  return (await discoverDetailed(root)).docs
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/discover.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(pipeline): discover markdown/orphan-html with dedup, caps, ignores"
```

---

### Task 5: `parse` — title, headings, and Sections

**Files:**
- Create: `src/main/pipeline/parse.ts`
- Create: `tests/parse.test.ts`

**Behavior:** extract the Title (first H1, else prettified filename), split the body into Sections at H1–H3 boundaries, strip markdown to plain text for each Section's `text`, and assign each heading a slug anchor. Content before the first heading is an intro Section (`headingId: ''`, `depth: 0`).

- [ ] **Step 1: Write the failing test `tests/parse.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { parseMarkdown, slugify, prettifyFilename } from '../src/main/pipeline/parse'

describe('slugify', () => {
  it('slugs heading text', () => {
    expect(slugify('Domain Model & Notes')).toBe('domain-model-notes')
  })
})

describe('prettifyFilename', () => {
  it('strips numeric prefix and extension', () => {
    expect(prettifyFilename('03-domain-model.md')).toBe('Domain Model')
  })
})

describe('parseMarkdown', () => {
  const md = [
    '# Database Design',
    '',
    'Intro paragraph.',
    '',
    '## Tables',
    '',
    'Some **bold** text about tables.',
    '',
    '## Indexes',
    '',
    'Index notes.'
  ].join('\n')

  it('uses the first H1 as the title', () => {
    const parsed = parseMarkdown('db.md', 'db.md', md)
    expect(parsed.title).toBe('Database Design')
  })

  it('splits into an intro section plus one per heading', () => {
    const parsed = parseMarkdown('db.md', 'db.md', md)
    const headings = parsed.sections.map((s) => s.headingText)
    expect(headings).toEqual(['', 'Database Design', 'Tables', 'Indexes'])
  })

  it('strips markdown from section text', () => {
    const parsed = parseMarkdown('db.md', 'db.md', md)
    const tables = parsed.sections.find((s) => s.headingText === 'Tables')!
    expect(tables.text).toContain('bold text about tables')
    expect(tables.text).not.toContain('**')
  })

  it('falls back to prettified filename when no H1', () => {
    const parsed = parseMarkdown('09-conventions.md', '09-conventions.md', 'no heading here')
    expect(parsed.title).toBe('Conventions')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/parse.test.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement `src/main/pipeline/parse.ts`**

```ts
import type { ParsedDoc, Section, DocKind } from '@shared/types'

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function prettifyFilename(name: string): string {
  const base = name.replace(/\.(md|html)$/i, '').replace(/^\d+[-_]/, '')
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Cheap markdown → plain text for indexing/snippets (not for display).
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`[^`]*`/g, ' ') // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/^[#>\-*+]\s+/gm, ' ') // list/quote/heading markers
    .replace(/[*_~]+/g, '') // emphasis
    .replace(/\|/g, ' ') // table pipes
    .replace(/\s+/g, ' ')
    .trim()
}

interface HeadingLine {
  line: number
  depth: number
  text: string
}

export function parseMarkdown(path: string, name: string, raw: string): ParsedDoc {
  const lines = raw.split('\n')
  const headings: HeadingLine[] = []
  let inFence = false
  lines.forEach((line, i) => {
    if (/^```/.test(line)) inFence = !inFence
    if (inFence) return
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (m) headings.push({ line: i, depth: m[1].length, text: m[2].trim() })
  })

  const firstH1 = headings.find((h) => h.depth === 1)
  const title = firstH1 ? firstH1.text : prettifyFilename(name)

  const sections: Section[] = []
  const usedSlugs = new Map<string, number>()
  const uniqueSlug = (base: string): string => {
    const n = usedSlugs.get(base) ?? 0
    usedSlugs.set(base, n + 1)
    return n === 0 ? base : `${base}-${n}`
  }

  // Intro section: text before the first heading.
  const firstHeadingLine = headings.length ? headings[0].line : lines.length
  const introText = stripMarkdown(lines.slice(0, firstHeadingLine).join('\n'))
  if (introText) {
    sections.push({
      id: `${path}#`,
      docPath: path,
      docTitle: title,
      headingId: '',
      headingText: '',
      depth: 0,
      text: introText
    })
  }

  headings.forEach((h, idx) => {
    const start = h.line + 1
    const end = idx + 1 < headings.length ? headings[idx + 1].line : lines.length
    const body = stripMarkdown(lines.slice(start, end).join('\n'))
    const headingId = uniqueSlug(slugify(h.text))
    sections.push({
      id: `${path}#${headingId}`,
      docPath: path,
      docTitle: title,
      headingId,
      headingText: h.text,
      depth: h.depth,
      text: `${h.text} ${body}`.trim()
    })
  })

  return { path, name, kind: 'md' as DocKind, title, sections }
}

// HTML docs are not parsed into sections (orphan html renders raw). We still index
// the title (from filename) so they appear in search by name.
export function parseHtml(path: string, name: string): ParsedDoc {
  const title = prettifyFilename(name)
  return {
    path,
    name,
    kind: 'html',
    title,
    sections: [
      { id: `${path}#`, docPath: path, docTitle: title, headingId: '', headingText: '', depth: 0, text: title }
    ]
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/parse.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(pipeline): parse title/headings/sections + markdown stripping"
```

---

### Task 6: `index` — per-Section MiniSearch build + query

**Files:**
- Create: `src/main/pipeline/index.ts`
- Create: `tests/index.test.ts`

**Behavior:** build a MiniSearch index with one record per Section, fields `headingText/docTitle/docPath/text`, boosting `headingText`, `docTitle`, `docPath` above `text`; `search()` returns ranked `SearchResult`s with a snippet drawn from the Section text.

- [ ] **Step 1: Write the failing test `tests/index.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildIndex, runSearch } from '../src/main/pipeline/index'
import type { Section } from '@shared/types'

const sections: Section[] = [
  { id: 'a.md#', docPath: 'a.md', docTitle: 'Auth', headingId: '', headingText: '', depth: 0, text: 'overview of authentication' },
  { id: 'a.md#tokens', docPath: 'a.md', docTitle: 'Auth', headingId: 'tokens', headingText: 'Tokens', depth: 2, text: 'Tokens refresh rotation' },
  { id: 'b.md#', docPath: 'b.md', docTitle: 'Billing', headingId: '', headingText: '', depth: 0, text: 'invoices and payments' }
]

describe('search index', () => {
  it('finds a section by body term', () => {
    const idx = buildIndex(sections)
    const results = runSearch(idx, 'rotation')
    expect(results[0].docPath).toBe('a.md')
    expect(results[0].headingId).toBe('tokens')
  })

  it('ranks a heading match above an incidental body match', () => {
    const idx = buildIndex(sections)
    const results = runSearch(idx, 'tokens')
    expect(results[0].headingText).toBe('Tokens')
  })

  it('returns empty for no matches', () => {
    const idx = buildIndex(sections)
    expect(runSearch(idx, 'zzzznomatch')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement `src/main/pipeline/index.ts`**

```ts
import MiniSearch from 'minisearch'
import type { Section, SearchResult } from '@shared/types'

const sectionById = new WeakMap<MiniSearch, Map<string, Section>>()

export function buildIndex(sections: Section[]): MiniSearch {
  const mini = new MiniSearch({
    idField: 'id',
    fields: ['headingText', 'docTitle', 'docPath', 'text'],
    storeFields: ['docPath', 'docTitle', 'headingId', 'headingText'],
    searchOptions: {
      boost: { headingText: 4, docTitle: 3, docPath: 2, text: 1 },
      prefix: true,
      fuzzy: 0.2
    }
  })
  mini.addAll(sections)
  const lookup = new Map(sections.map((s) => [s.id, s]))
  sectionById.set(mini, lookup)
  return mini
}

function makeSnippet(text: string, query: string): string {
  const q = query.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const lower = text.toLowerCase()
  const at = q ? lower.indexOf(q) : -1
  if (at < 0) return text.slice(0, 160)
  const start = Math.max(0, at - 60)
  const end = Math.min(text.length, at + 100)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

export function runSearch(index: MiniSearch, query: string): SearchResult[] {
  if (!query.trim()) return []
  const lookup = sectionById.get(index)!
  return index.search(query).map((r) => {
    const section = lookup.get(r.id as string)!
    return {
      docPath: section.docPath,
      docTitle: section.docTitle,
      headingId: section.headingId,
      headingText: section.headingText,
      snippet: makeSnippet(section.text, query),
      score: r.score
    }
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/index.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(pipeline): per-section MiniSearch index + ranked search"
```

---

### Task 7: `pathsafe` — traversal guard for getDoc

**Files:**
- Create: `src/main/util/pathsafe.ts`
- Create: `tests/pathsafe.test.ts`

**Behavior:** given a project root and a renderer-supplied relative path, return the resolved absolute path only if it stays within the root; otherwise throw.

- [ ] **Step 1: Write the failing test `tests/pathsafe.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { safeResolve } from '../src/main/util/pathsafe'

const root = resolve('tests/fixtures/sample-docs')

describe('safeResolve', () => {
  it('resolves a normal relative path', () => {
    expect(safeResolve(root, 'db.md')).toBe(resolve(root, 'db.md'))
  })

  it('rejects parent traversal', () => {
    expect(() => safeResolve(root, '../../etc/passwd')).toThrow(/outside project/i)
  })

  it('rejects absolute paths', () => {
    expect(() => safeResolve(root, '/etc/passwd')).toThrow(/outside project/i)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/pathsafe.test.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement `src/main/util/pathsafe.ts`**

```ts
import { resolve, relative, isAbsolute } from 'node:path'

export function safeResolve(root: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`Path outside project: ${relativePath}`)
  }
  const abs = resolve(root, relativePath)
  const rel = relative(root, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path outside project: ${relativePath}`)
  }
  return abs
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/pathsafe.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(util): path-traversal guard for getDoc"
```

---

### Task 8: `registry` — projects.json CRUD

**Files:**
- Create: `src/main/paths.ts`
- Create: `src/main/registry.ts`
- Create: `tests/registry.test.ts`

**Behavior:** read/write `projects.json` under a configurable base dir (so tests can inject a temp dir); `addLocalProject` creates a record with a generated UUID, derived name (directory basename) when none given, and `status: 'ok'`; `removeProject` drops it; identity dedup: adding the same absolute `source` returns the existing record instead of duplicating.

- [ ] **Step 1: Write `src/main/paths.ts`**

```ts
import { app } from 'electron'
import { join } from 'node:path'

// Overridable for tests (Electron's `app` is unavailable in vitest).
let baseDir: string | null = null
export function setBaseDir(dir: string): void {
  baseDir = dir
}
export function userDataDir(): string {
  if (baseDir) return baseDir
  return app.getPath('userData')
}
export function projectsFile(): string {
  return join(userDataDir(), 'projects.json')
}
```

- [ ] **Step 2: Write the failing test `tests/registry.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setBaseDir } from '../src/main/paths'
import { listProjects, addLocalProject, removeProject } from '../src/main/registry'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dv-reg-'))
  setBaseDir(dir)
})

describe('registry', () => {
  it('adds a local project with a derived name and uuid', async () => {
    const p = await addLocalProject('/Users/me/projects/mews-two')
    expect(p.name).toBe('mews-two')
    expect(p.type).toBe('local')
    expect(p.id).toMatch(/[0-9a-f-]{36}/)
    expect(await listProjects()).toHaveLength(1)
    await rm(dir, { recursive: true, force: true })
  })

  it('dedupes by absolute source', async () => {
    const a = await addLocalProject('/Users/me/docs')
    const b = await addLocalProject('/Users/me/docs')
    expect(b.id).toBe(a.id)
    expect(await listProjects()).toHaveLength(1)
    await rm(dir, { recursive: true, force: true })
  })

  it('removes a project', async () => {
    const p = await addLocalProject('/Users/me/docs')
    await removeProject(p.id)
    expect(await listProjects()).toHaveLength(0)
    await rm(dir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/registry.test.ts`
Expected: FAIL ("Cannot find module '../src/main/registry'").

- [ ] **Step 4: Implement `src/main/registry.ts`**

```ts
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Project } from '@shared/types'
import { projectsFile, userDataDir } from './paths'

async function readAll(): Promise<Project[]> {
  try {
    const raw = await readFile(projectsFile(), 'utf8')
    return JSON.parse(raw) as Project[]
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    // Corrupt registry: treat as empty rather than crashing the app.
    return []
  }
}

async function writeAll(projects: Project[]): Promise<void> {
  await mkdir(userDataDir(), { recursive: true })
  await writeFile(projectsFile(), JSON.stringify(projects, null, 2), 'utf8')
}

export async function listProjects(): Promise<Project[]> {
  return readAll()
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await readAll()).find((p) => p.id === id)
}

export async function addLocalProject(source: string, name?: string): Promise<Project> {
  const projects = await readAll()
  const existing = projects.find((p) => p.type === 'local' && p.source === source)
  if (existing) return existing
  const project: Project = {
    id: randomUUID(),
    name: name?.trim() || basename(source) || source,
    type: 'local',
    source,
    addedAt: new Date().toISOString(),
    status: 'ok'
  }
  projects.push(project)
  await writeAll(projects)
  return project
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<Project> {
  const projects = await readAll()
  const idx = projects.findIndex((p) => p.id === id)
  if (idx < 0) throw new Error(`Project not found: ${id}`)
  projects[idx] = { ...projects[idx], ...patch, id: projects[idx].id }
  await writeAll(projects)
  return projects[idx]
}

export async function removeProject(id: string): Promise<void> {
  const projects = await readAll()
  await writeAll(projects.filter((p) => p.id !== id))
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(main): project registry CRUD with dedup"
```

---

### Task 9: `projectService` — build + hold active local project

**Files:**
- Create: `src/main/projectService.ts`
- Create: `tests/projectService.test.ts`

**Behavior:** `selectProject(id)` reads the project, runs discover → parse → buildIndex **in-memory**, caches the active project's parsed docs + index + nav tree in a module-level holder, updates the registry (`docCount`, `lastBuiltAt`), and returns the nav tree. `getDoc` reads file content live (markdown raw, html raw) via the traversal guard. `search` queries the active index. Selecting a different project tears down the previous in-memory state (active-Project lifecycle).

- [ ] **Step 1: Write the failing test `tests/projectService.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setBaseDir } from '../src/main/paths'
import { addLocalProject } from '../src/main/registry'
import { selectProject, getDoc, search } from '../src/main/projectService'

let dir: string
const fixtures = resolve('tests/fixtures/sample-docs')

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dv-svc-'))
  setBaseDir(dir)
})

describe('projectService', () => {
  it('selects a local project and returns a nav tree', async () => {
    const p = await addLocalProject(fixtures)
    const { tree, docCount } = await selectProject(p.id)
    expect(docCount).toBeGreaterThan(0)
    const names = tree.map((n) => n.name)
    expect(names).toContain('guide') // folder
    await rm(dir, { recursive: true, force: true })
  })

  it('reads a document live', async () => {
    const p = await addLocalProject(fixtures)
    await selectProject(p.id)
    const doc = await getDoc(p.id, 'db.md')
    expect(doc.kind).toBe('md')
    expect(doc.content).toContain('# Database')
    await rm(dir, { recursive: true, force: true })
  })

  it('rejects traversal in getDoc', async () => {
    const p = await addLocalProject(fixtures)
    await selectProject(p.id)
    await expect(getDoc(p.id, '../../etc/passwd')).rejects.toThrow(/outside project/i)
    await rm(dir, { recursive: true, force: true })
  })

  it('searches the active index', async () => {
    const p = await addLocalProject(fixtures)
    await selectProject(p.id)
    const results = await search(p.id, 'setup')
    expect(results.some((r) => r.docPath === 'guide/02-setup.md')).toBe(true)
    await rm(dir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/projectService.test.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement `src/main/projectService.ts`**

```ts
import { readFile } from 'node:fs/promises'
import type MiniSearch from 'minisearch'
import type { NavNode, NavFolder, ParsedDoc, SearchResult, DocKind } from '@shared/types'
import { getProject, updateProject } from './registry'
import { discover } from './pipeline/discover'
import { parseMarkdown, parseHtml } from './pipeline/parse'
import { buildIndex, runSearch } from './pipeline/index'
import { safeResolve } from './util/pathsafe'

interface ActiveProject {
  id: string
  root: string
  docs: Map<string, ParsedDoc> // keyed by relative path
  index: MiniSearch
  tree: NavNode[]
}

let active: ActiveProject | null = null

function buildTree(docs: ParsedDoc[]): NavNode[] {
  const rootChildren: NavNode[] = []
  const folders = new Map<string, NavFolder>() // folder path → node

  const ensureFolder = (folderPath: string): NavNode[] => {
    if (folderPath === '') return rootChildren
    if (folders.has(folderPath)) return folders.get(folderPath)!.children
    const parts = folderPath.split('/')
    const name = parts[parts.length - 1]
    const parentPath = parts.slice(0, -1).join('/')
    const node: NavFolder = { type: 'folder', name, path: folderPath, children: [] }
    folders.set(folderPath, node)
    ensureFolder(parentPath).push(node)
    return node.children
  }

  for (const doc of docs) {
    const parts = doc.path.split('/')
    const folderPath = parts.slice(0, -1).join('/')
    ensureFolder(folderPath).push({
      type: 'doc',
      name: parts[parts.length - 1],
      title: doc.title,
      path: doc.path,
      kind: doc.kind
    })
  }

  const sortNodes = (nodes: NavNode[]): void => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    for (const n of nodes) if (n.type === 'folder') sortNodes(n.children)
  }
  sortNodes(rootChildren)
  return rootChildren
}

export async function selectProject(id: string): Promise<{ tree: NavNode[]; docCount: number }> {
  const project = await getProject(id)
  if (!project) throw new Error(`Project not found: ${id}`)

  // Tear down previous active project (active-Project lifecycle).
  active = null

  const root = project.source
  const discovered = await discover(root)
  const docs: ParsedDoc[] = []
  for (const d of discovered) {
    if (d.kind === 'md') {
      const raw = await readFile(safeResolve(root, d.path), 'utf8')
      docs.push(parseMarkdown(d.path, d.path.split('/').pop()!, raw))
    } else {
      docs.push(parseHtml(d.path, d.path.split('/').pop()!))
    }
  }

  const sections = docs.flatMap((d) => d.sections)
  const index = buildIndex(sections)
  const tree = buildTree(docs)

  active = { id, root, docs: new Map(docs.map((d) => [d.path, d])), index, tree }
  await updateProject(id, { docCount: docs.length, lastBuiltAt: new Date().toISOString(), status: 'ok' })

  return { tree, docCount: docs.length }
}

function requireActive(id: string): ActiveProject {
  if (!active || active.id !== id) throw new Error(`Project not active: ${id}`)
  return active
}

export async function getDoc(id: string, relativePath: string): Promise<{ kind: DocKind; content: string }> {
  const a = requireActive(id)
  const abs = safeResolve(a.root, relativePath)
  const content = await readFile(abs, 'utf8')
  const kind: DocKind = relativePath.toLowerCase().endsWith('.html') ? 'html' : 'md'
  return { kind, content }
}

export async function search(id: string, query: string): Promise<SearchResult[]> {
  const a = requireActive(id)
  return runSearch(a.index, query)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/projectService.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(main): in-memory local project build, nav tree, getDoc, search"
```

---

### Task 10: IPC wiring (main handlers + preload bridge)

**Files:**
- Create: `src/main/ipc.ts`
- Modify: `src/main/index.ts` (register handlers, call `setBaseDir`)
- Modify: `src/preload/index.ts` (typed bridge)

- [ ] **Step 1: Implement `src/main/ipc.ts`**

```ts
import { ipcMain, dialog } from 'electron'
import { listProjects, addLocalProject, removeProject } from './registry'
import { selectProject, getDoc, search } from './projectService'

export function registerIpc(): void {
  ipcMain.handle('projects:list', () => listProjects())
  ipcMain.handle('projects:addLocal', (_e, source: string, name?: string) =>
    addLocalProject(source, name)
  )
  ipcMain.handle('projects:remove', (_e, id: string) => removeProject(id))
  ipcMain.handle('projects:select', (_e, id: string) => selectProject(id))
  ipcMain.handle('projects:getDoc', (_e, id: string, relativePath: string) =>
    getDoc(id, relativePath)
  )
  ipcMain.handle('projects:search', (_e, id: string, query: string) => search(id, query))
  ipcMain.handle('dialog:pickDirectory', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })
}
```

- [ ] **Step 2: Update `src/main/index.ts` to register IPC**

Replace the file contents with:
```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

(Note: `paths.ts` defaults to `app.getPath('userData')` in production — no `setBaseDir` call is needed outside tests.)

- [ ] **Step 3: Update `src/preload/index.ts` to expose the typed API**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi } from '../shared/types'

const api: IpcApi = {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  addLocalProject: (source, name) => ipcRenderer.invoke('projects:addLocal', source, name),
  removeProject: (id) => ipcRenderer.invoke('projects:remove', id),
  selectProject: (id) => ipcRenderer.invoke('projects:select', id),
  getDoc: (id, relativePath) => ipcRenderer.invoke('projects:getDoc', id, relativePath),
  search: (id, query) => ipcRenderer.invoke('projects:search', id, query),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory')
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ipc): wire main handlers + typed preload bridge"
```

---

### Task 11: Render core (`render.ts`)

**Files:**
- Create: `src/renderer/src/lib/render.ts`
- Create: `tests/render.test.ts` (jsdom)

**Behavior:** `renderMarkdown(md)` returns sanitized HTML (marked → DOMPurify). `enhance(container)` finds mermaid code blocks, renders them with `securityLevel: 'strict'`, wraps them in zoomable canvases (svg-pan-zoom, click-to-expand), and builds heading anchors used by the TOC and search-scroll. Ported and hardened from `../mews-two/docs/scripts/build-db-html.mjs`.

- [ ] **Step 1: Write the failing test `tests/render.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/renderer/src/lib/render'

describe('renderMarkdown', () => {
  it('renders markdown to html', () => {
    const html = renderMarkdown('# Hello\n\nworld')
    expect(html).toContain('<h1')
    expect(html).toContain('Hello')
  })

  it('strips script tags (XSS sanitization)', () => {
    const html = renderMarkdown('ok <script>alert(1)</script> done')
    expect(html).not.toContain('<script')
  })

  it('strips img onerror handlers', () => {
    const html = renderMarkdown('![x](http://x "t")<img src=x onerror=alert(1)>')
    expect(html.toLowerCase()).not.toContain('onerror')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/render.test.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implement `src/renderer/src/lib/render.ts`**

```ts
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import mermaid from 'mermaid'
import svgPanZoom from 'svg-pan-zoom'

marked.setOptions({ gfm: true, breaks: false })

let mermaidReady = false
function initMermaid(): void {
  if (mermaidReady) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'strict',
    flowchart: { useMaxWidth: false, htmlLabels: false },
    er: { useMaxWidth: false }
  })
  mermaidReady = true
}

// Markdown → sanitized HTML string.
export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false }) as string
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
}

export function slugifyHeading(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export interface TocEntry {
  id: string
  text: string
  depth: number
}

// Assign ids to headings and return the TOC. Call after setting innerHTML.
export function buildToc(container: HTMLElement): TocEntry[] {
  const toc: TocEntry[] = []
  const used = new Map<string, number>()
  container.querySelectorAll('h1, h2, h3').forEach((h) => {
    const base = slugifyHeading(h.textContent ?? '')
    const n = used.get(base) ?? 0
    used.set(base, n + 1)
    const id = n === 0 ? base : `${base}-${n}`
    h.id = id
    toc.push({ id, text: h.textContent ?? '', depth: Number(h.tagName[1]) })
  })
  return toc
}

// Convert ```mermaid blocks into zoomable, click-to-expand diagrams.
export async function enhanceDiagrams(container: HTMLElement): Promise<void> {
  initMermaid()
  const blocks = Array.from(container.querySelectorAll('pre > code.language-mermaid'))
  for (let i = 0; i < blocks.length; i++) {
    const code = blocks[i] as HTMLElement
    const src = code.textContent ?? ''
    const wrap = document.createElement('div')
    wrap.className = 'diagram'
    const canvas = document.createElement('div')
    canvas.className = 'diagram-canvas'
    wrap.appendChild(canvas)
    code.parentElement!.replaceWith(wrap)
    try {
      const { svg } = await mermaid.render(`mmd-${i}-${Date.now()}`, src)
      canvas.innerHTML = svg
      const svgEl = canvas.querySelector('svg')!
      svgEl.setAttribute('width', '100%')
      svgEl.setAttribute('height', '100%')
      svgEl.style.maxWidth = 'none'
      const pz = svgPanZoom(svgEl, {
        zoomEnabled: true, panEnabled: true, controlIconsEnabled: true,
        dblClickZoomEnabled: false, fit: true, center: true, minZoom: 0.2, maxZoom: 30
      })
      let downX = 0, downY = 0, downT = 0
      canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; downT = e.timeStamp })
      canvas.addEventListener('pointerup', (e) => {
        const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
        if (moved < 6 && e.timeStamp - downT < 400) {
          wrap.classList.toggle('expanded')
          requestAnimationFrame(() => { try { pz.resize(); pz.fit(); pz.center() } catch { /* noop */ } })
        }
      })
    } catch (err) {
      canvas.innerHTML = `<div class="render-error">Diagram failed: ${(err as Error).message}</div>`
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/render.test.ts`
Expected: PASS (3 tests). (Note: `enhanceDiagrams` is exercised manually in the app; jsdom can't render mermaid SVGs, so only `renderMarkdown` is unit-tested.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(renderer): sanitized markdown + strict mermaid render core"
```

---

### Task 12: App shell + global styles

**Files:**
- Create: `src/renderer/src/styles.css`
- Modify: `src/renderer/src/main.tsx` (import styles)
- Modify: `src/renderer/src/App.tsx` (layout + state)

- [ ] **Step 1: Create `src/renderer/src/styles.css`** (ported palette from the existing viewer)

```css
:root {
  --bg: #fbfbfa; --fg: #1f2328; --muted: #59636e; --border: #d1d9e0;
  --accent: #5b3ba6; --accent-soft: #f1ecfb; --code-bg: #f4f4f3;
  --table-head: #f6f8fa; --diagram-bg: #ffffff; --diagram-ink: #1f2328;
  --sidebar-w: 300px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14171c; --fg: #e6edf3; --muted: #9aa4b0; --border: #2a323c;
    --accent: #b69cf0; --accent-soft: #221c34; --code-bg: #1c2128; --table-head: #1c2128;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
.layout { display: grid; grid-template-columns: var(--sidebar-w) 1fr; height: 100vh; }
.sidebar { border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.sidebar header { padding: 12px; border-bottom: 1px solid var(--border); display: flex; gap: 8px; }
.sidebar select, .sidebar button, .sidebar input { font: inherit; }
.sidebar .scroll { overflow-y: auto; padding: 8px; flex: 1; }
.content { overflow-y: auto; padding: 32px 40px 120px; max-width: 980px; }
.tree-item { display: block; width: 100%; text-align: left; background: none; border: 0;
  color: var(--fg); padding: 4px 8px; border-radius: 6px; cursor: pointer; }
.tree-item:hover { background: var(--accent-soft); }
.tree-item.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.tree-folder { color: var(--muted); padding: 6px 8px 2px; font-size: .8em; text-transform: uppercase; letter-spacing: .04em; }
.result { display: block; width: 100%; text-align: left; background: none; border: 0; border-radius: 6px;
  padding: 6px 8px; cursor: pointer; color: var(--fg); }
.result:hover { background: var(--accent-soft); }
.result .h { font-weight: 600; }
.result .meta { font-size: .8em; color: var(--muted); }
.result .snip { font-size: .82em; color: var(--muted); }
.empty { color: var(--muted); padding: 24px; }
h1, h2, h3 { line-height: 1.25; scroll-margin-top: 16px; }
pre { background: var(--code-bg); padding: 14px 16px; border-radius: 10px; overflow-x: auto; }
code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .86em;
  background: var(--code-bg); padding: .15em .4em; border-radius: 5px; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid var(--border); padding: 6px 10px; }
th { background: var(--table-head); }
.diagram { margin: 1.4em 0; }
.diagram-canvas { height: min(70vh, 720px); background: var(--diagram-bg);
  border: 1px solid var(--border); border-radius: 10px; overflow: hidden; cursor: grab; }
.diagram.expanded .diagram-canvas { height: min(82vh, 900px); }
.diagram-canvas svg text { fill: var(--diagram-ink); }
.render-error { color: #b3261e; background: #fdecea; border: 1px solid #f5c2bd; padding: 8px 12px; border-radius: 8px; }
```

- [ ] **Step 2: Import styles in `src/renderer/src/main.tsx`**

Add the import at the top (after the React imports):
```tsx
import './styles.css'
```

- [ ] **Step 3: Replace `src/renderer/src/App.tsx`** with the shell + state

```tsx
import { useEffect, useState, useCallback } from 'react'
import type { Project, NavNode, SearchResult } from '@shared/types'
import Sidebar from './components/Sidebar'
import DocView from './components/DocView'

export default function App(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tree, setTree] = useState<NavNode[]>([])
  const [docPath, setDocPath] = useState<string | null>(null)
  const [scrollToId, setScrollToId] = useState<string | null>(null)

  const refreshProjects = useCallback(async () => {
    setProjects(await window.api.listProjects())
  }, [])

  useEffect(() => { void refreshProjects() }, [refreshProjects])

  const selectProject = useCallback(async (id: string) => {
    setActiveId(id)
    setDocPath(null)
    const { tree } = await window.api.selectProject(id)
    setTree(tree)
  }, [])

  const addProject = useCallback(async () => {
    const dir = await window.api.pickDirectory()
    if (!dir) return
    const p = await window.api.addLocalProject(dir)
    await refreshProjects()
    await selectProject(p.id)
  }, [refreshProjects, selectProject])

  const openResult = useCallback((r: SearchResult) => {
    setDocPath(r.docPath)
    setScrollToId(r.headingId || null)
  }, [])

  const openDoc = useCallback((path: string) => {
    setDocPath(path)
    setScrollToId(null)
  }, [])

  return (
    <div className="layout">
      <Sidebar
        projects={projects}
        activeId={activeId}
        tree={tree}
        docPath={docPath}
        onSelectProject={selectProject}
        onAddProject={addProject}
        onOpenDoc={openDoc}
        onOpenResult={openResult}
      />
      <main className="content">
        {activeId && docPath ? (
          <DocView projectId={activeId} docPath={docPath} scrollToId={scrollToId} />
        ) : (
          <p className="empty">{activeId ? 'Select a document.' : 'Add or select a project to begin.'}</p>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Commit** (app won't compile until Task 13–14 add the components; that's expected — commit after Task 14)

Skip commit here; proceed to Task 13.

---

### Task 13: Sidebar + DocTree + SearchBox

**Files:**
- Create: `src/renderer/src/components/Sidebar.tsx`
- Create: `src/renderer/src/components/DocTree.tsx`
- Create: `src/renderer/src/components/SearchBox.tsx`

- [ ] **Step 1: Create `src/renderer/src/components/DocTree.tsx`**

```tsx
import type { NavNode } from '@shared/types'

interface Props {
  nodes: NavNode[]
  docPath: string | null
  onOpenDoc: (path: string) => void
  depth?: number
}

export default function DocTree({ nodes, docPath, onOpenDoc, depth = 0 }: Props): React.JSX.Element {
  return (
    <div>
      {nodes.map((node) =>
        node.type === 'folder' ? (
          <div key={node.path} style={{ paddingLeft: depth * 10 }}>
            <div className="tree-folder">{node.name}</div>
            <DocTree nodes={node.children} docPath={docPath} onOpenDoc={onOpenDoc} depth={depth + 1} />
          </div>
        ) : (
          <button
            key={node.path}
            className={`tree-item${docPath === node.path ? ' active' : ''}`}
            style={{ paddingLeft: 8 + depth * 10 }}
            title={node.name}
            onClick={() => onOpenDoc(node.path)}
          >
            {node.title}
          </button>
        )
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/renderer/src/components/SearchBox.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { SearchResult } from '@shared/types'

interface Props {
  projectId: string | null
  onOpenResult: (r: SearchResult) => void
}

export default function SearchBox({ projectId, onOpenResult }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!projectId) { setResults([]); return }
    if (timer.current) clearTimeout(timer.current)
    if (!query.trim()) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setResults(await window.api.search(projectId, query))
    }, 150)
  }, [query, projectId])

  return (
    <div>
      <input
        type="search"
        placeholder="Search docs…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', padding: '6px 8px', marginBottom: 8 }}
        disabled={!projectId}
      />
      {query.trim() && results.length === 0 && <div className="empty">No matches.</div>}
      {results.map((r) => (
        <button key={`${r.docPath}#${r.headingId}`} className="result" onClick={() => onOpenResult(r)}>
          <div className="h">{r.headingText || r.docTitle}</div>
          <div className="meta">{r.docTitle} · {r.docPath}</div>
          <div className="snip">{r.snippet}</div>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create `src/renderer/src/components/Sidebar.tsx`**

```tsx
import type { Project, NavNode, SearchResult } from '@shared/types'
import DocTree from './DocTree'
import SearchBox from './SearchBox'

interface Props {
  projects: Project[]
  activeId: string | null
  tree: NavNode[]
  docPath: string | null
  onSelectProject: (id: string) => void
  onAddProject: () => void
  onOpenDoc: (path: string) => void
  onOpenResult: (r: SearchResult) => void
}

export default function Sidebar(props: Props): React.JSX.Element {
  const { projects, activeId, tree, docPath } = props
  return (
    <aside className="sidebar">
      <header>
        <select
          value={activeId ?? ''}
          onChange={(e) => props.onSelectProject(e.target.value)}
          style={{ flex: 1 }}
        >
          <option value="" disabled>Select a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button onClick={props.onAddProject} title="Add a local directory">＋</button>
      </header>
      <div className="scroll">
        <SearchBox projectId={activeId} onOpenResult={props.onOpenResult} />
        {activeId ? (
          <DocTree nodes={tree} docPath={docPath} onOpenDoc={props.onOpenDoc} />
        ) : (
          <div className="empty">No project selected.</div>
        )}
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Commit** (still needs DocView — commit after Task 14)

Skip commit here; proceed to Task 14.

---

### Task 14: DocView (render + TOC scroll)

**Files:**
- Create: `src/renderer/src/components/DocView.tsx`

**Behavior:** loads a Document via `getDoc`; for markdown, renders sanitized HTML, builds the TOC, enhances mermaid diagrams, and scrolls to `scrollToId` (the search-result heading anchor) when present; for orphan HTML, renders it in a sandboxed `<iframe srcdoc>` with scripts off (1A).

- [ ] **Step 1: Create `src/renderer/src/components/DocView.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { DocKind } from '@shared/types'
import { renderMarkdown, buildToc, enhanceDiagrams } from '../lib/render'

interface Props {
  projectId: string
  docPath: string
  scrollToId: string | null
}

export default function DocView({ projectId, docPath, scrollToId }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [kind, setKind] = useState<DocKind>('md')
  const [html, setHtml] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const doc = await window.api.getDoc(projectId, docPath)
      if (cancelled) return
      setKind(doc.kind)
      setHtml(doc.kind === 'md' ? renderMarkdown(doc.content) : doc.content)
    })()
    return () => { cancelled = true }
  }, [projectId, docPath])

  // After markdown HTML is in the DOM: build TOC, enhance diagrams, scroll.
  useEffect(() => {
    if (kind !== 'md' || !ref.current || !html) return
    buildToc(ref.current)
    void enhanceDiagrams(ref.current).then(() => {
      if (scrollToId && ref.current) {
        const el = ref.current.querySelector(`#${CSS.escape(scrollToId)}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  }, [html, kind, scrollToId])

  if (kind === 'html') {
    return (
      <iframe
        title={docPath}
        sandbox=""
        srcDoc={html}
        style={{ width: '100%', height: '80vh', border: 0 }}
      />
    )
  }

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
}
```

(`dangerouslySetInnerHTML` is safe here: `html` is DOMPurify-sanitized in `renderMarkdown`.)

- [ ] **Step 2: Typecheck the renderer**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Run the app end-to-end**

Run: `npm run dev`
Then in the app: click ＋, choose `/Users/matt/projects/personal/mews-two/docs`, confirm the tree populates, open `db.md` (renders with mermaid diagrams), type "schema" in search and click a result (jumps to the section). Close with Ctrl-C.
Expected: docs render, diagrams are zoomable/click-to-expand, search returns per-section results.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(renderer): sidebar, doc tree, search box, doc view"
```

---

### Task 15: Local packaged build (electron-builder, unsigned)

**Files:**
- Modify: `package.json` (add electron-builder + scripts + config)
- Create: `electron-builder.yml`

**Behavior (spec 2A):** produce a local unsigned `.app`/`.dmg` for daily use; no signing/notarization/auto-update.

- [ ] **Step 1: Add electron-builder to devDependencies**

Run: `npm install -D electron-builder@^25.1.8`
Expected: installs.

- [ ] **Step 2: Add build scripts to `package.json`**

Add these entries to the `scripts` block:
```json
"build:mac": "electron-vite build && electron-builder --mac --dir",
"dist:mac": "electron-vite build && electron-builder --mac"
```

- [ ] **Step 3: Create `electron-builder.yml`**

```yaml
appId: com.borkweb.docviewer
productName: Doc Viewer
directories:
  output: dist
files:
  - out/**/*
  - package.json
mac:
  target: dmg
  category: public.app-category.developer-tools
  identity: null   # unsigned (2A)
```

- [ ] **Step 4: Produce an unpacked local build**

Run: `npm run build:mac`
Expected: `dist/mac*/Doc Viewer.app` is produced. Launch it to confirm it opens and you can add a local project.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "build: electron-builder local unsigned mac package (2A)"
```

---

### Task 16: Full verification pass

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: all suites pass (smoke, discover, parse, index, pathsafe, registry, projectService, render).

- [ ] **Step 2: Typecheck both projects**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual smoke against the real docs**

Run: `npm run dev`, add `/Users/matt/projects/personal/mews-two/docs`, verify: tree sorted with numeric prefixes in order, titles shown (not filenames), `db.md` mermaid diagrams render + zoom + click-to-expand, search "conventions" returns a section result that scrolls into view, removing/re-adding the project works.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore: plan 1 verification pass"
```

---

## Self-Review Notes (author)

- **Spec coverage (Plan-1 slice):** scaffold ✓, registry + dedup ✓, discover (caps/ignores/symlink/1A dedup) ✓, parse (title/headings/Sections, prettify) ✓, per-Section MiniSearch ✓, traversal guard ✓, in-memory local build + nav tree (filename sort, Title labels) ✓, live getDoc ✓, active-Project teardown ✓, render core (DOMPurify + mermaid strict + svg-pan-zoom + TOC) ✓, sandboxed orphan-HTML iframe (1A) ✓, Electron hardening (sandbox/contextIsolation/CSP) ✓, 2A local package ✓. **Deferred to later plans (intentionally not here):** GitHub/clone/cache/branch-switcher, file-watch (E2), session memory (E3), ⌘K (E4), Manage Projects view, theming, the structured log file + build-progress streaming (added with the GitHub pipeline where long-running builds make it meaningful).
- **Type consistency:** `IpcApi` in `types.ts` matches the preload bridge and `ipc.ts` channel handlers; `selectProject` returns `{ tree, docCount }` everywhere; `SearchResult`/`NavNode` shapes are consistent across main and renderer.
- **Known nits to watch during execution:** delete the unused `dirname`/`readlink` import lines flagged inline if your linter is strict; mermaid SVG rendering isn't unit-testable under jsdom (covered by the manual smoke step instead).
