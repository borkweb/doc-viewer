# Plan 3 — Manage Projects View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each task is TDD: write a failing test, run it (expect FAIL), implement complete code (no placeholders), run it (expect PASS), typecheck/build where relevant, then commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated, full-content **Manage Projects view** to the Curator Electron app so the user can rename projects, set a per-project document-theme override, delete projects (purging derived cache), and change a GitHub project's `docsSubpath` (re-scoping identity, checking collisions, and rebuilding) — plus client-side sort & filter of the list.

**Architecture:** `App` gains a `view: 'docs' | 'manage'` mode flag (no router — matches the current App-as-controller pattern). A top-bar toggle switches modes; in `manage` the content area renders a new `<ManageProjects>` list and the sidebar is hidden (existing `no-sidebar` body class). Rename and theme commit through the existing `updateProjectSettings` IPC; delete through the existing `removeProject` IPC (it already purges cache). The one new backend piece is `projectService.setDocsSubpath`, which checks identity collision against the registry, patches `docsSubpath`, purges the cache, and rebuilds `currentRef` — streamed over a new `projects:setDocsSubpath` IPC handler. The document pane theme resolves per-project as `activeProject?.themeId ?? theme.document`.

**Tech Stack:** Electron, electron-vite, React 19, TypeScript, `bun test` (native runner, `import from 'bun:test'`), jsdom renderer tests via the `bunfig.toml` preload (`react-dom/client` `createRoot` + `act` + `React.createElement`).

**Spec:** `docs/superpowers/specs/2026-06-14-plan-3-manage-projects-design.md` (source of truth for scope, states, copy). **Predecessors:** Plan 1 (local viewer), Plan 2a/2b (GitHub backend + UI), plus the bottom status-bar / top-nav relayout.

**Reconciliation with current code (read before starting):**
- `src/shared/types.ts`: `Project` is already the discriminated union (`LocalProject | GithubProject`). `ProjectBase.themeId` is currently typed **`string`**; this plan narrows it to a shared **`ThemeChoice`**. `IpcApi` already has `updateProjectSettings`, `removeProject`, `rebuildProject`, `switchRef`, `onBuildProgress`, etc. This plan **adds `setDocsSubpath`** to `IpcApi` (returns `{ tree, docCount }`).
- **`ThemeChoice` shared-type decision (call-out):** `ThemeChoice` currently lives only in the renderer (`src/renderer/src/lib/theme.ts` as `'dark' | 'light' | 'system'`). Because `ProjectBase.themeId` (a `src/shared` type) must reference it, this plan makes **`src/shared/types.ts` the single source of truth**: it defines `export type ThemeChoice` plus a runtime `export const THEME_CHOICES`. `lib/theme.ts` then **re-exports the type** and imports `THEME_CHOICES` for its internal `CHOICES` list (DRY; no behavior change). Existing `import { ThemeChoice } from '../lib/theme'` sites (`Settings.tsx`) keep working via the re-export.
- `src/main/projectService.ts`: has `selectProject`, `getDoc`, `search`, `addGithubProject`, `switchRef`, `rebuildProject`, `cancelBuild`, an `inFlight` `AbortController` map, `noProgress`, `loadGithubRef`, and a `BuildDeps = { spawnFn? }` type. This plan **adds `setDocsSubpath(id, subpath, onProgress?, deps?)`**.
- `src/main/registry.ts`: has `updateProject(id, patch: ProjectPatch)`, `addGithubProject`, `getProject`, `listProjects`, and imports `githubIdentity` from `./util/github`. This plan **adds a `findGithubByIdentity` collision helper** (reuses `githubIdentity`).
- `src/main/ipc.ts` / `src/preload/index.ts`: method-per-operation handlers with a `progressTo(e)` helper that streams `e.sender.send('build:progress', p)`. This plan **adds `projects:setDocsSubpath`** (streamed, like `projects:switchRef`) and the preload bridge method.
- `src/main/cache.ts`: `purgeProjectCache` already exists and is what `setDocsSubpath` uses.
- `src/renderer/src/App.tsx`: holds `projects`, `activeId`, `tree`, `docPath`, theme state (`theme.document`, `resolveTheme`, `systemDark`), `refreshProjects`, `selectProject`. This plan **adds `view` state, manage wiring, per-project document-theme resolution, and delete-active handling**.
- `src/renderer/src/components/TopBar.tsx`: this plan **adds a "Manage projects" toggle icon-button** (`onToggleManage`, `manageActive`).
- `src/renderer/src/components/Settings.tsx` + `lib/theme.ts`: the `ThemeChoice` vocabulary; the per-row theme select reuses the same option set (Global / Dark / Light / System).
- `src/renderer/src/styles.css`: append `.manage-*` styles using existing tokens (`--surface`, `--surface-alt`, `--border`, `--muted`, `--faint`, `--accent`, `--accent-ring`, `--radius-*`, `--space-*`, `--text-*`); reuse `.empty-state`, `.icon-button`, `.field`, `.add-error`.
- **Renderer test harness (critical):** tests run under `bun test` with `tests/setup-dom.ts` (jsdom) preloaded via `bunfig.toml`. Component tests must (1) render via `react-dom/client` `createRoot` + `act` + `React.createElement` (never call the component as a function), (2) dispatch DOM events with `new window.Event(...)` / `new window.KeyboardEvent(...)`, (3) set controlled-input values via the prototype `value` setter then dispatch an `input` event, and (4) be listed in `tsconfig.web.json` `"include"` and `tsconfig.node.json` `"exclude"`. See `tests/addProjectModal.test.ts` and `tests/branchSwitcher.test.ts`.
- **Commands:** `bun test <file>`, `bun run typecheck` (node + web projects), `bunx electron-vite build`. Run `bun test <file>` per task (don't background a full-suite run mid-task).

---

## File Structure

```
MODIFIED
  src/shared/types.ts                       # ThemeChoice + THEME_CHOICES; themeId narrowed; IpcApi.setDocsSubpath
  src/renderer/src/lib/theme.ts             # re-export shared ThemeChoice; CHOICES from THEME_CHOICES
  src/main/registry.ts                      # findGithubByIdentity collision helper (reuse githubIdentity)
  src/main/projectService.ts                # setDocsSubpath orchestration
  src/main/ipc.ts                           # updateSettings themeId narrowed (Task 1); projects:setDocsSubpath handler (Task 3)
  src/preload/index.ts                      # setDocsSubpath bridge method
  src/renderer/src/App.tsx                  # view mode, manage wiring, per-project doc theme, delete-active
  src/renderer/src/components/TopBar.tsx    # "Manage projects" toggle button
  src/renderer/src/styles.css               # .manage-* styles + motion
  tsconfig.web.json                         # include new renderer test files
  tsconfig.node.json                        # exclude new renderer test files

CREATED
  src/renderer/src/components/ManageProjects.tsx
  tests/manageTypes.test.ts                 # shared ThemeChoice / THEME_CHOICES (node)
  tests/setDocsSubpath.test.ts              # backend orchestration (node)
  tests/manageProjects.test.ts              # renderer (web tsconfig)
  tests/topBarManage.test.ts                # renderer (web tsconfig)
  tests/appDeleteActive.test.ts             # one App-level delete-active integration test (web tsconfig)
```

---

## Task 1 — Shared `ThemeChoice`, narrowed `themeId`, and `ipc.ts` alignment

**Files:** `src/shared/types.ts`, `src/renderer/src/lib/theme.ts`, `src/main/ipc.ts`, `tests/manageTypes.test.ts`

- [ ] Write a failing test `tests/manageTypes.test.ts`:
  ```ts
  import { describe, it, expect } from 'bun:test'
  import { THEME_CHOICES } from '../src/shared/types'
  import type { ThemeChoice, Project } from '../src/shared/types'

  describe('shared ThemeChoice', () => {
    it('exposes the three theme choices as a runtime list', () => {
      expect([...THEME_CHOICES].sort()).toEqual(['dark', 'light', 'system'])
    })
    it('types themeId as a ThemeChoice on a project', () => {
      const t: ThemeChoice = 'dark'
      const p: Project = {
        id: 'a', name: 'x', type: 'local', source: '/tmp/x',
        addedAt: 'now', status: 'ok', themeId: t
      }
      expect(p.themeId).toBe('dark')
    })
  })
  ```
- [ ] Run: `bun test tests/manageTypes.test.ts` — expect FAIL (`THEME_CHOICES` is not exported yet).
- [ ] Implement in `src/shared/types.ts`. **Add** the shared theme types near the top (above `ProjectStatus`), and **narrow** `ProjectBase.themeId`:
  ```ts
  // Per-region theme selection vocabulary. Single source of truth (the renderer's
  // lib/theme re-exports this). 'system' follows the OS via prefers-color-scheme.
  export type ThemeChoice = 'dark' | 'light' | 'system'
  export const THEME_CHOICES: readonly ThemeChoice[] = ['dark', 'light', 'system']
  ```
  In `interface ProjectBase`, change the `themeId` line from:
  ```ts
    themeId?: string // per-project theme override (Plan 5); absent = use global
  ```
  to:
  ```ts
    themeId?: ThemeChoice // per-project document-theme override; absent = use global
  ```
- [ ] In `src/shared/types.ts`, narrow the `updateProjectSettings` patch's `themeId` in `IpcApi`. (The `IpcApi.setDocsSubpath` method is **not** added here — it lands in Task 3 alongside its preload implementation so typecheck stays green. Adding the interface method here without the preload bridge would leave the preload `api` object failing to satisfy `IpcApi`.) Change the `updateProjectSettings` signature:
  ```ts
    updateProjectSettings(
      id: string,
      patch: { name?: string; docsSubpath?: string; themeId?: ThemeChoice }
    ): Promise<Project>
  ```
- [ ] Update `src/renderer/src/lib/theme.ts` to consume the shared type (DRY). Replace the local `ThemeChoice` definition and `CHOICES` constant. Change the top of the file:
  ```ts
  import type { ThemeChoice } from '@shared/types'
  import { THEME_CHOICES } from '@shared/types'

  export type { ThemeChoice }
  export type ResolvedTheme = 'dark' | 'light'
  ```
  (Remove the old `export type ThemeChoice = 'dark' | 'light' | 'system'` line.) Then change the `CHOICES` constant to reuse the shared list:
  ```ts
  const CHOICES: readonly ThemeChoice[] = THEME_CHOICES
  ```
  (`isChoice` already does `(CHOICES as string[]).includes(v)`; the `readonly` widening is fine. Leave `ResolvedTheme`, `ThemeSettings`, `DEFAULT_THEME`, `loadThemeSettings`, `saveThemeSettings`, `resolveTheme` otherwise unchanged.)
- [ ] Align `src/main/ipc.ts`'s `projects:updateSettings` handler with the narrowed `themeId` (otherwise its `patch` param is wider than the `IpcApi` contract). Import `ThemeChoice` from `@shared/types` and change the handler's `patch` param type from:
  ```ts
    { name?: string; docsSubpath?: string; themeId?: string }
  ```
  to:
  ```ts
    { name?: string; docsSubpath?: string; themeId?: ThemeChoice }
  ```
- [ ] Run: `bun test tests/manageTypes.test.ts` — expect PASS.
- [ ] Run: `bun run typecheck` — expect PASS across **both** the node + web projects. Narrowing `themeId` and aligning `ipc.ts`'s `projects:updateSettings` handler means Task 1 compiles cleanly with no dangling `IpcApi` method (the `setDocsSubpath` interface + preload bridge land together in Task 3). `Settings.tsx`'s `import { ThemeChoice } from '../lib/theme'` resolves via the re-export.
- [ ] Commit: `feat(types): shared ThemeChoice, narrowed themeId, and ipc.ts alignment`

## Task 2 — Backend `setDocsSubpath` + registry identity-collision helper

**Files:** `src/main/registry.ts`, `src/main/projectService.ts`, `tests/setDocsSubpath.test.ts`

- [ ] Write failing tests `tests/setDocsSubpath.test.ts` (backend; node tsconfig already globs `tests`). The fake spawn materializes a tiny repo into the clone dir, mirroring `tests/githubProjectService.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'bun:test'
  import { EventEmitter } from 'node:events'
  import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import { setBaseDir } from '../src/main/paths'
  import { addGithubProject, selectProject, getDoc, setDocsSubpath } from '../src/main/projectService'
  import { addLocalProject, getProject } from '../src/main/registry'
  import type { GithubProject } from '../src/shared/types'

  let base: string
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'dv-setsub-'))
    setBaseDir(base)
  })

  // Fake spawn writing `files` into the clone dest, then exit 0. `onCall` counts builds.
  function repoSpawn(files: Record<string, string>, onCall: () => void = () => {}) {
    return ((cmd: string, args: string[]) => {
      onCall()
      const child = new EventEmitter() as unknown as { stdout: EventEmitter; stderr: EventEmitter; kill: () => void }
      ;(child as { stdout: EventEmitter }).stdout = new EventEmitter()
      ;(child as { stderr: EventEmitter }).stderr = new EventEmitter()
      ;(child as { kill: () => void }).kill = () => {}
      queueMicrotask(async () => {
        const dest = args[args.length - 1]
        for (const [rel, content] of Object.entries(files)) {
          const abs = join(dest, rel)
          await mkdir(join(abs, '..'), { recursive: true })
          await writeFile(abs, content)
        }
        ;(child as unknown as EventEmitter).emit('close', 0)
      })
      return child as never
    }) as never
  }

  describe('setDocsSubpath', () => {
    it('re-scopes to the subpath: rebuilds, updates the registry, drops old-scope docs', async () => {
      const spawnFn = repoSpawn({ 'README.md': '# Root', 'pkg/notes.md': '# Notes' })
      const p = await addGithubProject('o/r', { ref: 'main' }, () => {}, { spawnFn })
      const before = await selectProject(p.id)
      expect(before.docCount).toBe(2)

      const res = await setDocsSubpath(p.id, 'pkg', () => {}, { spawnFn })
      expect(res.docCount).toBe(1)
      expect(((await getProject(p.id)) as GithubProject).docsSubpath).toBe('pkg')

      await selectProject(p.id)
      const doc = await getDoc(p.id, 'pkg/notes.md')
      expect(doc.content).toContain('# Notes')
      await expect(getDoc(p.id, 'README.md')).rejects.toThrow(/not in cache/i)
    })

    it('throws on an identity collision and leaves the project unchanged', async () => {
      const spawnFn = repoSpawn({ 'README.md': '# Root', 'pkg/notes.md': '# Notes' })
      const a = await addGithubProject('o/r', { ref: 'main' }, () => {}, { spawnFn })            // root scope
      await addGithubProject('o/r', { ref: 'main', docsSubpath: 'pkg' }, () => {}, { spawnFn })  // pkg scope (distinct identity)
      await expect(setDocsSubpath(a.id, 'pkg', () => {}, { spawnFn })).rejects.toThrow(/collision/i)
      expect(((await getProject(a.id)) as GithubProject).docsSubpath).toBeUndefined()
    })

    it('rejects a non-github project', async () => {
      const local = await addLocalProject('/tmp/some/dir')
      await expect(setDocsSubpath(local.id, 'docs', () => {}, {})).rejects.toThrow(/not a github/i)
    })

    it('is a no-op (no rebuild) when the subpath is unchanged', async () => {
      let calls = 0
      const spawnFn = repoSpawn({ 'pkg/notes.md': '# Notes' }, () => { calls++ })
      const p = await addGithubProject('o/r', { ref: 'main', docsSubpath: 'pkg' }, () => {}, { spawnFn })
      expect(calls).toBe(1)
      const res = await setDocsSubpath(p.id, 'pkg', () => {}, { spawnFn })
      expect(res.docCount).toBe(1)
      expect(calls).toBe(1) // unchanged subpath → served from cache, no second clone
    })

    it('editing a non-active project does not change which project is active', async () => {
      const spawnFn = repoSpawn({ 'README.md': '# Root', 'pkg/notes.md': '# Notes' })
      const a = await addGithubProject('o/a', { ref: 'main' }, () => {}, { spawnFn })
      const b = await addGithubProject('o/b', { ref: 'main' }, () => {}, { spawnFn })
      await selectProject(a.id) // A is the active project
      const res = await setDocsSubpath(b.id, 'pkg', () => {}, { spawnFn }) // re-scope NON-active B
      expect(res.docCount).toBe(1)
      expect(((await getProject(b.id)) as GithubProject).docsSubpath).toBe('pkg')
      // `active` is untouched: A's docs still resolve (B never became active).
      expect((await getDoc(a.id, 'README.md')).content).toContain('# Root')
    })

    it('rejects a concurrent build with a build-in-progress error and does not start a second build', async () => {
      // A gated spawn keeps the first build in-flight until we release it.
      let release: () => void = () => {}
      const gate = new Promise<void>((r) => { release = r })
      let builds = 0
      const gatedSpawn = ((_cmd: string, args: string[]) => {
        builds++
        const child = new EventEmitter() as unknown as { stdout: EventEmitter; stderr: EventEmitter; kill: () => void }
        ;(child as { stdout: EventEmitter }).stdout = new EventEmitter()
        ;(child as { stderr: EventEmitter }).stderr = new EventEmitter()
        ;(child as { kill: () => void }).kill = () => {}
        void gate.then(async () => {
          const dest = args[args.length - 1]
          await mkdir(join(dest, 'pkg'), { recursive: true })
          await writeFile(join(dest, 'pkg', 'notes.md'), '# Notes')
          ;(child as unknown as EventEmitter).emit('close', 0)
        })
        return child as never
      }) as never

      const p = await addGithubProject('o/r', { ref: 'main' }, () => {}, {
        spawnFn: repoSpawn({ 'README.md': '# Root' })
      })
      const first = setDocsSubpath(p.id, 'pkg', () => {}, { spawnFn: gatedSpawn })
      while (builds === 0) await Promise.resolve() // wait until the first build is in-flight
      await expect(setDocsSubpath(p.id, 'docs', () => {}, { spawnFn: gatedSpawn }))
        .rejects.toMatchObject({ code: 'build-in-progress' })
      release()
      await first
      expect(builds).toBe(1) // the rejected second call never started a build
    })
  })
  ```
- [ ] Run: `bun test tests/setDocsSubpath.test.ts` — expect FAIL (`setDocsSubpath` / `findGithubByIdentity` missing).
- [ ] Implement the collision helper in `src/main/registry.ts`. Add it after `addGithubProject` (it reuses the already-imported `githubIdentity`):
  ```ts
  // Find a github project whose identity (source + docsSubpath, ref-excluded) matches,
  // optionally excluding one id (the project being edited). Used by setDocsSubpath to
  // refuse a re-scope that would duplicate an existing project.
  export async function findGithubByIdentity(
    source: string,
    docsSubpath: string | undefined,
    excludeId?: string
  ): Promise<GithubProject | undefined> {
    const identity = githubIdentity(source, docsSubpath)
    const projects = await readAll()
    return projects.find(
      (p): p is GithubProject =>
        p.type === 'github' &&
        p.id !== excludeId &&
        githubIdentity(p.source, p.docsSubpath) === identity
    )
  }
  ```
- [ ] Implement `setDocsSubpath` in `src/main/projectService.ts`. Add `findGithubByIdentity` to the registry import, then add the function after `rebuildProject`:
  - Extend the registry import (the existing block from `'./registry'`) to include `findGithubByIdentity`:
    ```ts
    import {
      getProject, updateProject, removeProject as registryRemoveProject,
      addGithubProject as registryAddGithub, recordRef, setCurrentRef, removeRefRecord,
      findGithubByIdentity
    } from './registry'
    ```
  - Add the orchestration:
    Also extend the existing `./cache` import to include `readCache` (alongside `purgeProjectCache`) so the result can be derived from cache without reloading `active`. Then add:
    ```ts
    // ── docsSubpath change (github) ─────────────────────────────────────────────
    // Re-scope what a github project indexes. Collision-checks the new identity,
    // patches docsSubpath, purges ALL cached refs (the subpath changes discovery),
    // then rebuilds currentRef. It only reloads module-level `active` when THIS
    // project is the active one (mirrors rebuildProject); for a non-active project
    // it derives { tree, docCount } from the rebuilt cache WITHOUT clobbering
    // `active`. A no-op (unchanged subpath) returns the current ref from cache
    // without a rebuild. Throws (tagged) on collision WITHOUT mutating, and refuses
    // to start a second concurrent build for the same id.
    export async function setDocsSubpath(
      id: string,
      subpath: string,
      onProgress: (p: BuildProgress) => void = noProgress,
      deps: BuildDeps = {}
    ): Promise<{ tree: NavNode[]; docCount: number }> {
      const project = await getProject(id)
      if (!project) throw new Error(`Project not found: ${id}`)
      if (project.type !== 'github') throw new Error(`Not a github project: ${id}`)

      // Refuse a second concurrent build for the same project (tagged so the UI can
      // distinguish it from a collision). NOTE: adding the same guard to the older
      // switchRef / rebuildProject entrypoints is a deliberate follow-up, out of
      // Plan 3 scope.
      if (inFlight.has(id)) {
        const e = new Error('Build already in progress') as Error & { code?: string }
        e.code = 'build-in-progress'
        throw e
      }

      // Resolve the result without touching `active` unless this is the active project.
      const present = async (ref: string): Promise<{ tree: NavNode[]; docCount: number }> => {
        if (active?.id === id) {
          return loadGithubRef((await getProject(id)) as GithubProject, ref, onProgress, deps)
        }
        const cache = await readCache(id, ref)
        return { tree: cache.manifest.tree, docCount: cache.manifest.docCount }
      }

      const normalized = subpath.trim() || undefined
      if ((project.docsSubpath ?? undefined) === normalized) {
        // Unchanged → serve the current ref from cache (no rebuild), preserving `active`.
        return present(project.currentRef)
      }

      const collision = await findGithubByIdentity(project.source, normalized, id)
      if (collision) {
        const e = new Error(
          `docsSubpath collision: another project already uses ${project.source} + ${normalized ?? '(root)'}`
        ) as Error & { code?: string }
        e.code = 'collision'
        throw e
      }

      await updateProject(id, { docsSubpath: normalized })
      await purgeProjectCache(id) // all refs: discovery scope changed
      const updated = (await getProject(id)) as GithubProject

      const controller = new AbortController()
      inFlight.set(id, controller)
      try {
        const { ref, docCount } = await buildGithubRef(updated, updated.currentRef, onProgress, controller.signal, deps)
        await recordRef(id, ref, docCount)
      } finally {
        inFlight.delete(id)
      }
      // Reload only if active; otherwise derive from the freshly-rebuilt cache.
      return present(updated.currentRef)
    }
    ```
  (Note: `purgeProjectCache` removes every ref's cache, but only `currentRef` is rebuilt here. Other `refs[]` records remain; `switchRef`'s existing `hasCache` check rebuilds them on demand the next time they're selected. Intended.)
  (Note: the collision error is tagged `code: 'collision'` and the concurrency guard tags `code: 'build-in-progress'`; the renderer branches its copy on these markers — see Task 4. The same concurrency guard for `switchRef`/`rebuildProject` is deliberately deferred (out of Plan 3 scope).)
- [ ] Run: `bun test tests/setDocsSubpath.test.ts` — expect PASS.
- [ ] Run: `bun run typecheck` — expect PASS.
- [ ] Commit: `feat(projects): setDocsSubpath re-scope with identity-collision check and rebuild`

## Task 3 — IPC + preload wiring for `setDocsSubpath`

**Files:** `src/shared/types.ts`, `src/main/ipc.ts`, `src/preload/index.ts`

- [ ] Add the `setDocsSubpath` method to the `IpcApi` interface in `src/shared/types.ts`, just after `rebuildProject` (deferred from Task 1 so the interface addition and its preload bridge — below in this same task — land together and typecheck stays green):
  ```ts
    rebuildProject(id: string): Promise<void> // "Pull latest" (github) / "Reindex" (local)
    setDocsSubpath(id: string, subpath: string): Promise<{ tree: NavNode[]; docCount: number }>
  ```
- [ ] Update `src/main/ipc.ts`. Add `setDocsSubpath` to the `projectService` import and register a streamed handler (uses the existing `progressTo(e)` helper, like `projects:switchRef`). Change the import block:
  ```ts
  import {
    selectProject, getDoc, search,
    addGithubProject, rebuildProject, cancelBuild,
    listRefs, switchRef, addRef, removeRef, setDocsSubpath
  } from './projectService'
  ```
  Add the handler immediately after the `projects:rebuild` handler:
  ```ts
    ipcMain.handle('projects:setDocsSubpath', (e, id: string, subpath: string) =>
      setDocsSubpath(id, subpath, progressTo(e))
    )
  ```
- [ ] Update `src/preload/index.ts`. Add the bridge method just after `rebuildProject`:
  ```ts
    setDocsSubpath: (id, subpath) => ipcRenderer.invoke('projects:setDocsSubpath', id, subpath),
  ```
- [ ] Run: `bun run typecheck` — expect PASS (the preload `api` object must satisfy `IpcApi`, which now requires `setDocsSubpath`).
- [ ] Run: `bunx electron-vite build` — expect a clean build (main + preload + renderer compile).
- [ ] Commit: `feat(ipc): wire projects:setDocsSubpath with streamed build progress`

## Task 4 — `ManageProjects` component (rows, controls, states, sort/filter)

**Files:** `src/renderer/src/components/ManageProjects.tsx`, `tests/manageProjects.test.ts`, `tsconfig.web.json`, `tsconfig.node.json`

> Reconciliation: the spec says rename can be triggered by "click rename (or the name)". The name also doubles as the **select** affordance (selecting a project from the list returns to docs). To avoid a double-bind, this plan makes the **name** the select affordance and a dedicated **pencil** button the rename trigger. Noted in Self-Review.

- [ ] Register the two new renderer test files with the TypeScript projects.
  - In `tsconfig.web.json`, add them to `"include"`:
    ```json
    "include": ["src/renderer/src", "src/shared", "src/main/pipeline/parse.ts", "tests/render.test.ts", "tests/addProjectModal.test.ts", "tests/branchSwitcher.test.ts", "tests/manageProjects.test.ts", "tests/topBarManage.test.ts"]
    ```
  - In `tsconfig.node.json`, add them to `"exclude"`:
    ```json
    "exclude": ["tests/render.test.ts", "tests/addProjectModal.test.ts", "tests/branchSwitcher.test.ts", "tests/manageProjects.test.ts", "tests/topBarManage.test.ts"]
    ```
- [ ] Write failing tests `tests/manageProjects.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'bun:test'
  import { act, createElement } from 'react'
  import { createRoot, type Root } from 'react-dom/client'
  import ManageProjects from '../src/renderer/src/components/ManageProjects'
  import type { Project, ThemeChoice } from '../src/shared/types'

  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(window as unknown as { api: Partial<Window['api']> }).api = { onBuildProgress: () => () => {} }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  const local: Project = {
    id: 'l1', name: 'Curator Docs', type: 'local', source: '/home/me/curator/docs',
    addedAt: 'now', status: 'ok', docCount: 12, lastBuiltAt: '2026-06-10T00:00:00Z'
  }
  const gh: Project = {
    id: 'g1', name: 'react/react.dev', type: 'github', source: 'https://github.com/react/react.dev',
    refs: [{ ref: 'main', lastBuiltAt: '2026-06-13T00:00:00Z', docCount: 3 }],
    currentRef: 'main', addedAt: 'now', status: 'ok'
  }

  function setValue(el: HTMLInputElement, v: string): void {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, v)
    el.dispatchEvent(new window.Event('input', { bubbles: true }))
  }

  type Handlers = Parameters<typeof ManageProjects>[0]
  function handlers(over: Partial<Handlers> = {}): Omit<Handlers, 'projects'> {
    return {
      onRename: () => {},
      onSetTheme: () => {},
      onSetDocsSubpath: async () => ({ docCount: 1 }),
      onDelete: () => {},
      onSelect: () => {},
      onAddProject: () => {},
      onDone: () => {},
      ...over
    }
  }
  async function renderMP(projects: Project[], over: Partial<Handlers> = {}): Promise<void> {
    await act(async () => {
      root.render(createElement(ManageProjects, { projects, ...handlers(over) }))
    })
  }

  describe('ManageProjects', () => {
    it('renders a row per project with local/github type chips', async () => {
      await renderMP([local, gh])
      const chips = Array.from(container.querySelectorAll('[data-chip]')).map((c) => c.textContent)
      expect(chips).toContain('local')
      expect(chips).toContain('github')
      expect(container.querySelectorAll('[data-row]').length).toBe(2)
    })

    it('renders the first-run empty state with an Add project button', async () => {
      let added = false
      await renderMP([], { onAddProject: () => { added = true } })
      const add = container.querySelector('[data-action="add-project"]') as HTMLButtonElement
      expect(add).toBeTruthy()
      expect(container.textContent).toContain('No projects yet — add one to get started.')
      await act(async () => { add.click() })
      expect(added).toBe(true)
    })

    it('commits a rename and ignores a blank name', async () => {
      const calls: [string, string][] = []
      await renderMP([local], { onRename: (id, name) => calls.push([id, name]) })
      await act(async () => { (container.querySelector('[data-action="rename"]') as HTMLButtonElement).click() })
      const input = container.querySelector('[data-field="rename"]') as HTMLInputElement
      await act(async () => { setValue(input, 'Renamed') })
      await act(async () => { input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
      expect(calls).toEqual([['l1', 'Renamed']])

      await act(async () => { (container.querySelector('[data-action="rename"]') as HTMLButtonElement).click() })
      const input2 = container.querySelector('[data-field="rename"]') as HTMLInputElement
      await act(async () => { setValue(input2, '   ') })
      await act(async () => { input2.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
      expect(calls).toHaveLength(1) // blank → no extra update sent
    })

    it('commits theme changes and clears the override on Global', async () => {
      const calls: [string, ThemeChoice | undefined][] = []
      await renderMP([local], { onSetTheme: (id, t) => calls.push([id, t]) })
      const sel = container.querySelector('[data-role="theme-select"]') as HTMLSelectElement
      await act(async () => { sel.value = 'dark'; sel.dispatchEvent(new window.Event('change', { bubbles: true })) })
      await act(async () => { sel.value = ''; sel.dispatchEvent(new window.Event('change', { bubbles: true })) })
      expect(calls).toEqual([['l1', 'dark'], ['l1', undefined]])
    })

    it('requires an inline confirm before deleting', async () => {
      let deleted: string | null = null
      await renderMP([local], { onDelete: (id) => { deleted = id } })
      await act(async () => { (container.querySelector('[data-action="delete"]') as HTMLButtonElement).click() })
      expect(deleted).toBeNull()
      const confirm = container.querySelector('[data-action="confirm-delete"]') as HTMLButtonElement
      expect(confirm.textContent).toContain('Delete')
      await act(async () => { confirm.click() })
      expect(deleted).toBe('l1')
    })

    it('edits docsSubpath on a github row only', async () => {
      const calls: [string, string][] = []
      await renderMP([gh], { onSetDocsSubpath: async (id, sp) => { calls.push([id, sp]); return { docCount: 2 } } })
      await act(async () => { (container.querySelector('[data-action="edit-subpath"]') as HTMLButtonElement).click() })
      const input = container.querySelector('[data-field="docsSubpath"]') as HTMLInputElement
      await act(async () => { setValue(input, 'docs') })
      await act(async () => { (container.querySelector('[data-action="commit-subpath"]') as HTMLButtonElement).click() })
      expect(calls).toEqual([['g1', 'docs']])
    })

    it('does not render a docsSubpath control on local rows', async () => {
      await renderMP([local])
      expect(container.querySelector('[data-action="edit-subpath"]')).toBeNull()
    })

    it('shows the collision copy and keeps the field open on a tagged collision reject', async () => {
      await renderMP([gh], {
        onSetDocsSubpath: async () => {
          const e = new Error('docsSubpath collision') as Error & { code?: string }
          e.code = 'collision'
          throw e
        }
      })
      await act(async () => { (container.querySelector('[data-action="edit-subpath"]') as HTMLButtonElement).click() })
      const input = container.querySelector('[data-field="docsSubpath"]') as HTMLInputElement
      await act(async () => { setValue(input, 'dup') })
      await act(async () => { (container.querySelector('[data-action="commit-subpath"]') as HTMLButtonElement).click() })
      expect(container.textContent).toContain('Another project already uses that repo + subpath.')
      expect(container.querySelector('[data-field="docsSubpath"]')).toBeTruthy() // still open
    })

    it('shows the generic rebuild copy on a non-collision reject (e.g. build/network failure)', async () => {
      await renderMP([gh], { onSetDocsSubpath: async () => { throw new Error('clone failed') } })
      await act(async () => { (container.querySelector('[data-action="edit-subpath"]') as HTMLButtonElement).click() })
      const input = container.querySelector('[data-field="docsSubpath"]') as HTMLInputElement
      await act(async () => { setValue(input, 'docs') })
      await act(async () => { (container.querySelector('[data-action="commit-subpath"]') as HTMLButtonElement).click() })
      expect(container.textContent).toContain("Couldn't rebuild at that subpath.")
      expect(container.textContent).not.toContain('Another project already uses')
      expect(container.querySelector('[data-field="docsSubpath"]')).toBeTruthy() // still open
    })

    it('disables row controls while a project is building', async () => {
      await renderMP([{ ...gh, status: 'building' }])
      expect((container.querySelector('[data-action="delete"]') as HTMLButtonElement).disabled).toBe(true)
    })

    it('filters by name and source, with a clear-filter empty state', async () => {
      await renderMP([local, gh])
      const filter = container.querySelector('[data-role="filter"]') as HTMLInputElement
      await act(async () => { setValue(filter, 'react') })
      expect(container.querySelectorAll('[data-row]').length).toBe(1)
      await act(async () => { setValue(filter, 'github.com/react') }) // source match
      expect(container.querySelectorAll('[data-row]').length).toBe(1)
      await act(async () => { setValue(filter, 'zzz') })
      expect(container.querySelectorAll('[data-row]').length).toBe(0)
      expect(container.textContent).toContain('No projects match "zzz".')
      await act(async () => { (container.querySelector('[data-action="clear-filter"]') as HTMLButtonElement).click() })
      expect(container.querySelectorAll('[data-row]').length).toBe(2)
    })

    it('sorts by type (local before github) and by recently built (desc)', async () => {
      await renderMP([gh, local])
      const sort = container.querySelector('[data-role="sort"]') as HTMLSelectElement
      await act(async () => { sort.value = 'type'; sort.dispatchEvent(new window.Event('change', { bubbles: true })) })
      let ids = Array.from(container.querySelectorAll('[data-row]')).map((r) => r.getAttribute('data-row'))
      expect(ids).toEqual(['l1', 'g1'])
      await act(async () => { sort.value = 'recent'; sort.dispatchEvent(new window.Event('change', { bubbles: true })) })
      ids = Array.from(container.querySelectorAll('[data-row]')).map((r) => r.getAttribute('data-row'))
      expect(ids).toEqual(['g1', 'l1']) // gh built 06-13 > local 06-10
    })

    it('fires onDone from the Done button', async () => {
      let done = false
      await renderMP([local], { onDone: () => { done = true } })
      await act(async () => { (container.querySelector('[data-action="done"]') as HTMLButtonElement).click() })
      expect(done).toBe(true)
    })
  })
  ```
- [ ] Run: `bun test tests/manageProjects.test.ts` — expect FAIL (`ManageProjects` missing).
- [ ] Implement `src/renderer/src/components/ManageProjects.tsx`:
  ```tsx
  import { useEffect, useMemo, useState } from 'react'
  import type { Project, BuildProgress, ThemeChoice } from '@shared/types'

  type SortKey = 'name' | 'type' | 'recent'

  export interface ManageProjectsProps {
    projects: Project[]
    onRename: (id: string, name: string) => void
    onSetTheme: (id: string, themeId: ThemeChoice | undefined) => void
    onSetDocsSubpath: (id: string, subpath: string) => Promise<{ docCount: number }>
    onDelete: (id: string) => void
    onSelect: (id: string) => void
    onAddProject: () => void
    onDone: () => void
  }

  const THEME_OPTIONS: { value: '' | ThemeChoice; label: string }[] = [
    { value: '', label: 'Global' },
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' }
  ]

  // Middle-truncate a long source for the IDE-feel mono path.
  function midTruncate(s: string, max = 52): string {
    if (s.length <= max) return s
    const keep = Math.floor((max - 1) / 2)
    return `${s.slice(0, keep)}…${s.slice(s.length - keep)}`
  }

  function recencyOf(p: Project): number {
    if (p.type === 'local') return p.lastBuiltAt ? Date.parse(p.lastBuiltAt) : 0
    const times = p.refs.map((r) => Date.parse(r.lastBuiltAt)).filter((n) => !Number.isNaN(n))
    return times.length ? Math.max(...times) : 0
  }

  function countLabel(p: Project): string {
    return p.type === 'local' ? `${p.docCount ?? 0} docs` : `${p.refs.length} branches`
  }

  function Row({
    project, progress, onRename, onSetTheme, onSetDocsSubpath, onDelete, onSelect
  }: {
    project: Project
    progress?: BuildProgress
    onRename: ManageProjectsProps['onRename']
    onSetTheme: ManageProjectsProps['onSetTheme']
    onSetDocsSubpath: ManageProjectsProps['onSetDocsSubpath']
    onDelete: ManageProjectsProps['onDelete']
    onSelect: ManageProjectsProps['onSelect']
  }): React.JSX.Element {
    const [renaming, setRenaming] = useState(false)
    const [nameDraft, setNameDraft] = useState(project.name)
    const [confirming, setConfirming] = useState(false)
    const [editingSubpath, setEditingSubpath] = useState(false)
    const [subpathDraft, setSubpathDraft] = useState(project.docsSubpath ?? '')
    const [subpathError, setSubpathError] = useState<string | null>(null)
    const [zeroDoc, setZeroDoc] = useState(false)
    const [localBusy, setLocalBusy] = useState(false)

    const busy = project.status === 'building' || localBusy

    const commitRename = (): void => {
      setRenaming(false)
      const next = nameDraft.trim()
      if (!next) { setNameDraft(project.name); return } // blank → prior name, no update
      if (next === project.name) return
      onRename(project.id, next)
    }

    const commitSubpath = async (): Promise<void> => {
      setSubpathError(null)
      setZeroDoc(false)
      setLocalBusy(true)
      try {
        const { docCount } = await onSetDocsSubpath(project.id, subpathDraft.trim())
        setEditingSubpath(false)
        if (docCount === 0) setZeroDoc(true)
      } catch (err) {
        // Branch on the backend's structured marker (code: 'collision'), falling back
        // to a message check in case the code is stripped crossing the IPC boundary.
        // A collision gets the identity copy; everything else (build-in-progress,
        // network/clone/build failure) gets the generic rebuild-failure copy.
        const e = err as { code?: string; message?: string } | null
        const isCollision = e?.code === 'collision' || /collision/i.test(e?.message ?? '')
        setSubpathError(
          isCollision
            ? 'Another project already uses that repo + subpath.'
            : "Couldn't rebuild at that subpath."
        )
      } finally {
        setLocalBusy(false)
      }
    }

    return (
      <div className="manage-row" data-row={project.id}>
        <div className="manage-row-main">
          {renaming ? (
            <input
              className="manage-rename"
              data-field="rename"
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') { setNameDraft(project.name); setRenaming(false) }
              }}
            />
          ) : (
            <button
              type="button"
              className="manage-name"
              data-action="select"
              onClick={() => onSelect(project.id)}
              title={`Open ${project.name}`}
            >
              {project.name}
            </button>
          )}
          <span className="manage-source" data-source title={project.source}>
            {midTruncate(project.source)}
          </span>
          <span className="manage-chip" data-chip>{project.type}</span>
          <span className="manage-count" data-count>{countLabel(project)}</span>
        </div>

        <div className="manage-controls">
          {busy && <span className="manage-progress">{progress?.stage ?? 'Building'}…</span>}

          {!confirming && (
            <>
              <button
                type="button"
                className="icon-button"
                data-action="rename"
                disabled={busy}
                title="Rename"
                aria-label="Rename"
                onClick={() => { setNameDraft(project.name); setRenaming(true) }}
              >
                <i className="fa-solid fa-pen" aria-hidden="true" />
              </button>

              <select
                className="manage-theme"
                data-role="theme-select"
                aria-label="Project theme"
                disabled={busy}
                value={project.themeId ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  onSetTheme(project.id, v === '' ? undefined : (v as ThemeChoice))
                }}
              >
                {THEME_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value}>{`Theme: ${o.label}`}</option>
                ))}
              </select>

              {project.type === 'github' && !editingSubpath && (
                <button
                  type="button"
                  className="icon-button"
                  data-action="edit-subpath"
                  disabled={busy}
                  title="Edit docs subpath"
                  aria-label="Edit docs subpath"
                  onClick={() => { setSubpathDraft(project.docsSubpath ?? ''); setEditingSubpath(true) }}
                >
                  <i className="fa-solid fa-folder-tree" aria-hidden="true" />
                </button>
              )}

              <button
                type="button"
                className="icon-button manage-delete"
                data-action="delete"
                disabled={busy}
                title="Delete"
                aria-label="Delete"
                onClick={() => setConfirming(true)}
              >
                <i className="fa-solid fa-trash" aria-hidden="true" />
              </button>
            </>
          )}

          {confirming && (
            <div className="manage-confirm">
              <span>{`Delete ${project.name}?`}</span>
              <button type="button" className="icon-button" data-action="cancel-delete" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className="icon-button manage-delete" data-action="confirm-delete" onClick={() => onDelete(project.id)}>
                Delete
              </button>
            </div>
          )}
        </div>

        {editingSubpath && (
          <div className="manage-subpath">
            <input
              className="manage-subpath-input"
              data-field="docsSubpath"
              autoFocus
              placeholder="docs subpath (e.g. docs)"
              value={subpathDraft}
              disabled={busy}
              onChange={(e) => setSubpathDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitSubpath()
                if (e.key === 'Escape') { setEditingSubpath(false); setSubpathError(null) }
              }}
            />
            <button type="button" className="icon-button" data-action="commit-subpath" disabled={busy} onClick={() => void commitSubpath()}>
              <i className="fa-solid fa-check" aria-hidden="true" />
            </button>
            {subpathError && <span className="add-error" role="alert">{subpathError}</span>}
          </div>
        )}
        {zeroDoc && !editingSubpath && (
          <div className="manage-subpath"><span className="manage-note">No docs found at that subpath.</span></div>
        )}
      </div>
    )
  }

  export default function ManageProjects(props: ManageProjectsProps): React.JSX.Element {
    const { projects } = props
    const [query, setQuery] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('name')
    const [progressById, setProgressById] = useState<Record<string, BuildProgress>>({})

    // Live build progress for busy rows (streamed by setDocsSubpath / rebuild).
    useEffect(() => {
      return window.api.onBuildProgress((p) => {
        setProgressById((prev) => ({ ...prev, [p.projectId]: p }))
      })
    }, [])

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase()
      const matched = q
        ? projects.filter((p) => p.name.toLowerCase().includes(q) || p.source.toLowerCase().includes(q))
        : projects.slice()
      const byName = (a: Project, b: Project): number =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      matched.sort((a, b) => {
        if (sortKey === 'name') return byName(a, b)
        if (sortKey === 'type') return a.type === b.type ? byName(a, b) : a.type === 'local' ? -1 : 1
        return recencyOf(b) - recencyOf(a) || byName(a, b) // recent, desc
      })
      return matched
    }, [projects, query, sortKey])

    return (
      <section className="manage" aria-label="Manage Projects">
        <header className="manage-header">
          <h1 className="manage-title">Manage Projects</h1>
          <div className="manage-tools">
            <input
              className="manage-filter"
              data-role="filter"
              placeholder="Filter projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="manage-sort"
              data-role="sort"
              aria-label="Sort projects"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="name">Sort: Name</option>
              <option value="type">Sort: Type</option>
              <option value="recent">Sort: Recently built</option>
            </select>
            <button type="button" className="icon-button manage-done" data-action="done" onClick={props.onDone}>
              Done
            </button>
          </div>
        </header>

        {projects.length === 0 ? (
          <div className="empty-state">
            <i className="empty-icon fa-solid fa-folder-open" aria-hidden="true" />
            <p>No projects yet — add one to get started.</p>
            <button type="button" className="icon-button" data-action="add-project" onClick={props.onAddProject}>
              Add project
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>{`No projects match "${query.trim()}".`}</p>
            <button type="button" className="icon-button" data-action="clear-filter" onClick={() => setQuery('')}>
              Clear filter
            </button>
          </div>
        ) : (
          <div className="manage-list">
            {filtered.map((p) => (
              <Row
                key={p.id}
                project={p}
                progress={progressById[p.id]}
                onRename={props.onRename}
                onSetTheme={props.onSetTheme}
                onSetDocsSubpath={props.onSetDocsSubpath}
                onDelete={props.onDelete}
                onSelect={props.onSelect}
              />
            ))}
          </div>
        )}
      </section>
    )
  }
  ```
- [ ] Run: `bun test tests/manageProjects.test.ts` — expect PASS.
- [ ] Run: `bun run typecheck` — expect PASS.
- [ ] Commit: `feat(ui): ManageProjects view — rows, rename/theme/subpath/delete, sort + filter`

## Task 5 — Wire view mode into App + TopBar (toggle, Done, per-project doc theme, delete-active)

**Files:** `src/renderer/src/components/TopBar.tsx`, `src/renderer/src/App.tsx`, `tests/topBarManage.test.ts`, `tests/appDeleteActive.test.ts`, `tsconfig.web.json`, `tsconfig.node.json`

- [ ] Write a failing test `tests/topBarManage.test.ts` (the only DOM-testable unit of this task; the App glue is verified by typecheck + build + manual smoke):
  ```ts
  import { describe, it, expect, beforeEach } from 'bun:test'
  import { act, createElement } from 'react'
  import { createRoot, type Root } from 'react-dom/client'
  import TopBar from '../src/renderer/src/components/TopBar'

  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  describe('TopBar manage toggle', () => {
    it('renders a Manage projects toggle that fires onToggleManage', async () => {
      let toggled = false
      await act(async () => {
        root.render(createElement(TopBar, {
          projects: [], activeId: null, activeProject: null, docTitle: null, toc: [],
          onSelectProject: () => {}, onOpenAdd: () => {}, onRebuild: () => {},
          onJumpTo: () => {}, onOpenSettings: () => {},
          manageActive: false, onToggleManage: () => { toggled = true }
        }))
      })
      const btn = container.querySelector('[data-action="toggle-manage"]') as HTMLButtonElement
      expect(btn).toBeTruthy()
      expect(btn.getAttribute('aria-label')).toBe('Manage projects')
      await act(async () => { btn.click() })
      expect(toggled).toBe(true)
    })
  })
  ```
- [ ] Run: `bun test tests/topBarManage.test.ts` — expect FAIL (`onToggleManage` prop / button missing).
- [ ] Update `src/renderer/src/components/TopBar.tsx`. Add the two props to `Props`:
  ```ts
    onOpenSettings: () => void
    manageActive: boolean
    onToggleManage: () => void
  ```
  In `topbar-right`, render the toggle just before the Settings gear button:
  ```tsx
        <button
          type="button"
          className={`icon-button${props.manageActive ? ' active' : ''}`}
          data-action="toggle-manage"
          onClick={props.onToggleManage}
          title="Manage projects"
          aria-label="Manage projects"
          aria-pressed={props.manageActive}
        >
          <i className="fa-solid fa-sliders" aria-hidden="true" />
        </button>
  ```
- [ ] Run: `bun test tests/topBarManage.test.ts` — expect PASS.
- [ ] Update `src/renderer/src/App.tsx`:
  - Add the import and a `ThemeChoice`-aware doc theme. Add to the existing imports:
    ```tsx
    import ManageProjects from './components/ManageProjects'
    ```
  - Add `view` state near the other `useState`s:
    ```tsx
    const [view, setView] = useState<'docs' | 'manage'>('docs')
    ```
  - Resolve the document theme per-project. Replace the existing `const docTheme = resolveTheme(theme.document, systemDark)` line. (Place this line after `activeProject` is computed — move the `activeProject`/`docTitle` derivations above the `chromeTheme`/`docTheme` lines if needed so `activeProject` is in scope.)
    ```tsx
    const activeProject = activeId ? projects.find((p) => p.id === activeId) ?? null : null
    const chromeTheme = resolveTheme(theme.chrome, systemDark)
    const docTheme = resolveTheme(activeProject?.themeId ?? theme.document, systemDark)
    ```
    (Remove the now-duplicated `activeProject` declaration that currently sits just above the `return`.)
  - Make `selectProject` exit manage mode (selecting from the dropdown or a row returns to docs). At the top of the existing `selectProject` callback body, add:
    ```tsx
      setView('docs')
    ```
  - Add the manage-view mutation handlers (after the existing `removeRef` callback):
    ```tsx
    const manageRename = useCallback(async (id: string, name: string) => {
      await window.api.updateProjectSettings(id, { name })
      await refreshProjects()
    }, [refreshProjects])

    const manageSetTheme = useCallback(async (id: string, themeId: ThemeChoice | undefined) => {
      await window.api.updateProjectSettings(id, { themeId })
      await refreshProjects()
    }, [refreshProjects])

    const manageSetDocsSubpath = useCallback(async (id: string, subpath: string) => {
      const { tree: next, docCount } = await window.api.setDocsSubpath(id, subpath)
      await refreshProjects()
      if (id === activeId) {
        setTree(next)
        // Preserve the open doc if it survives the re-scope; otherwise clear it so we
        // don't keep rendering a path that no longer exists under the new subpath.
        if (docPath && !treeHasPath(next, docPath)) {
          setDocPath(null)
          resetDocState()
        }
      }
      return { docCount }
    }, [refreshProjects, activeId, docPath, resetDocState])

    const manageDelete = useCallback(async (id: string) => {
      await window.api.removeProject(id)
      if (id === activeId) {
        setActiveId(null)
        setTree([])
        setDocPath(null)
        resetDocState()
      }
      await refreshProjects()
    }, [refreshProjects, activeId, resetDocState])
    ```
    Add the `ThemeChoice` type import to the existing `@shared/types` import line:
    ```tsx
    import type { Project, NavNode, SearchResult, ThemeChoice } from '@shared/types'
    ```
  - Add a module-level `treeHasPath` helper next to the existing `findDocTitle` (used by `manageSetDocsSubpath`'s preserve-if-present check — keep the open doc when it still exists in the re-scoped tree, otherwise clear it):
    ```tsx
    // True if a doc node addressed by `path` exists anywhere in the nav tree.
    function treeHasPath(nodes: NavNode[], path: string): boolean {
      for (const node of nodes) {
        if (node.type === 'doc') {
          if (node.path === path) return true
        } else if (treeHasPath(node.children, path)) {
          return true
        }
      }
      return false
    }
    ```
  - Pass the toggle props to `<TopBar>` (add to the existing usage):
    ```tsx
        manageActive={view === 'manage'}
        onToggleManage={() => setView((v) => (v === 'manage' ? 'docs' : 'manage'))}
    ```
  - Hide the sidebar in manage mode by widening the existing `no-sidebar` condition:
    ```tsx
      <div className={`app-body${activeId && view === 'docs' ? '' : ' no-sidebar'}`}>
        {activeId && view === 'docs' && (
          <Sidebar
    ```
  - Render the manage view in the content area. Replace the `<main className="content" ...>` body so it branches on `view`:
    ```tsx
        <main className="content" data-theme={docTheme}>
          {view === 'manage' ? (
            <ManageProjects
              projects={projects}
              onRename={manageRename}
              onSetTheme={manageSetTheme}
              onSetDocsSubpath={manageSetDocsSubpath}
              onDelete={manageDelete}
              onSelect={selectProject}
              onAddProject={() => setAddOpen(true)}
              onDone={() => setView('docs')}
            />
          ) : (
            <div className="content-inner">
              {activeId && docPath ? (
                <DocView
                  projectId={activeId}
                  docPath={docPath}
                  scrollToId={scrollToId}
                  scrollNonce={scrollNonce}
                  onToc={setToc}
                  onStats={setStats}
                />
              ) : (
                <div className="empty-state">
                  <i
                    className={`empty-icon fa-solid ${activeId ? 'fa-file-lines' : 'fa-folder-open'}`}
                    aria-hidden="true"
                  />
                  <p>{activeId ? 'Select a document.' : 'Add or select a project to begin.'}</p>
                </div>
              )}
            </div>
          )}
        </main>
    ```
  - Keep the `StatusBar` only in docs mode. Wrap its block so it renders when `activeProject && view === 'docs'`:
    ```tsx
        {activeProject && view === 'docs' && (
          <StatusBar
    ```
- [ ] Register the new App-level test file with the TypeScript projects (so it compiles under web and is excluded from node):
  - In `tsconfig.web.json`, append `"tests/appDeleteActive.test.ts"` to `"include"`.
  - In `tsconfig.node.json`, append `"tests/appDeleteActive.test.ts"` to `"exclude"`.
- [ ] Write ONE focused App-level jsdom test for delete-active, `tests/appDeleteActive.test.ts` (this is the single full-App integration test in this plan — do **not** scaffold a broad App harness; the other App paths stay on the manual-smoke checklist):
  ```ts
  import { describe, it, expect, beforeEach } from 'bun:test'
  import { act, createElement } from 'react'
  import { createRoot, type Root } from 'react-dom/client'
  import App from '../src/renderer/src/App'
  import type { Project } from '../src/shared/types'

  let container: HTMLDivElement
  let root: Root

  const A: Project = { id: 'a', name: 'Alpha', type: 'local', source: '/tmp/a', addedAt: 'now', status: 'ok', docCount: 1 }
  const B: Project = { id: 'b', name: 'Beta', type: 'local', source: '/tmp/b', addedAt: 'now', status: 'ok', docCount: 1 }

  beforeEach(() => {
    // App reads matchMedia (systemDark); stub it if the jsdom setup hasn't.
    if (!window.matchMedia) {
      ;(window as unknown as { matchMedia: unknown }).matchMedia = () => ({
        matches: false, addEventListener: () => {}, removeEventListener: () => {}
      })
    }
    let list: Project[] = [A, B]
    ;(window as unknown as { api: Partial<Window['api']> }).api = {
      listProjects: async () => list,
      selectProject: async () => ({
        tree: [{ type: 'doc', name: 'r.md', title: 'R', path: 'r.md', kind: 'md' }],
        docCount: 1
      }),
      onBuildProgress: () => () => {},
      removeProject: async (id: string) => { list = list.filter((p) => p.id !== id) }
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  describe('App delete-active', () => {
    it('clears the active doc, tree, and sidebar when the active project is deleted', async () => {
      await act(async () => { root.render(createElement(App)) })
      await act(async () => {}) // flush initial refreshProjects

      const toggle = (): HTMLButtonElement =>
        container.querySelector('[data-action="toggle-manage"]') as HTMLButtonElement

      // Open Manage, select Alpha (makes it active and returns to docs).
      await act(async () => { toggle().click() })
      await act(async () => { (container.querySelector('[data-row="a"] [data-action="select"]') as HTMLButtonElement).click() })
      expect(container.querySelector('.sidebar')).toBeTruthy() // active project → sidebar shown

      // Re-open Manage and delete Alpha (inline two-step confirm).
      await act(async () => { toggle().click() })
      await act(async () => { (container.querySelector('[data-row="a"] [data-action="delete"]') as HTMLButtonElement).click() })
      await act(async () => { (container.querySelector('[data-row="a"] [data-action="confirm-delete"]') as HTMLButtonElement).click() })

      // Back in docs: no active project → sidebar gone, neutral prompt shown (docPath null).
      await act(async () => { toggle().click() })
      expect(container.querySelector('.sidebar')).toBeNull()
      expect(container.textContent).toContain('Add or select a project to begin.')
    })
  })
  ```
- [ ] Run: `bun test tests/appDeleteActive.test.ts` — expect PASS.
- [ ] Run: `bun run typecheck` — expect PASS. Run `bunx electron-vite build` — expect a clean build. Run `bun test tests/topBarManage.test.ts tests/manageProjects.test.ts tests/appDeleteActive.test.ts` — expect PASS.
- [ ] Manual smoke (document in commit body; not automated): `bun run dev` → click the Manage toggle, rename a project, change its Theme select (document pane reflects it on the active project), edit a github docsSubpath (watch the row go busy + rebuild), delete a project (inline two-step), filter + sort, press Done. Delete the active project → sidebar/doc clear and you stay in Manage.
- [ ] Commit: `feat(ui): manage-projects view mode, per-project doc theme, delete-active handling`

## Task 6 — `.manage-*` styles + motion

**Files:** `src/renderer/src/styles.css`

- [ ] Append the manage-view styles to `src/renderer/src/styles.css`. These reuse existing tokens and the `.icon-button` / `.empty-state` / `.add-error` classes already in the file:
  ```css
  /* ── Manage Projects view ─────────────────────────────────────────────── */
  .manage { display: flex; flex-direction: column; height: 100%; min-height: 0;
    overflow-y: auto; padding: var(--space-4); }
  .manage-header { display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-3); margin-bottom: var(--space-4); }
  .manage-title { font-size: var(--text-lg); font-weight: var(--weight-semibold); margin: 0; }
  .manage-tools { display: flex; align-items: center; gap: var(--space-2); }
  .manage-filter, .manage-sort {
    padding: 6px 10px; border-radius: var(--radius-sm);
    border: 1px solid var(--border); background: var(--surface); color: var(--fg); font-size: 13px; }
  .manage-filter:focus-visible, .manage-sort:focus-visible {
    outline: none; box-shadow: 0 0 0 3px var(--accent-ring); }
  .manage-done { width: auto; padding: 0 12px; }

  .manage-list { display: flex; flex-direction: column; }
  .manage-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2);
    padding: var(--space-3); border-bottom: 1px solid var(--border); background: var(--surface);
    transition: background 120ms ease-out; }
  .manage-row:hover { background: var(--surface-alt); }
  .manage-row-main { display: flex; align-items: baseline; gap: var(--space-3);
    flex: 1; min-width: 0; }
  .manage-name { background: none; border: none; color: var(--fg); cursor: pointer;
    font-size: var(--text-base); font-weight: var(--weight-semibold); padding: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40%; }
  .manage-name:hover { color: var(--accent); }
  .manage-rename { font-size: var(--text-base); padding: 4px 8px; border-radius: var(--radius-sm);
    border: 1px solid var(--border); background: var(--surface); color: var(--fg); }
  .manage-source { color: var(--muted); font-family: var(--font-mono, monospace); font-size: 12px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .manage-chip { font-size: 11px; color: var(--muted); background: var(--surface-alt);
    border-radius: var(--radius-sm); padding: 1px 6px; }
  .manage-count { color: var(--faint); font-size: 12px; }
  .manage-controls { display: flex; align-items: center; gap: var(--space-1); }
  .manage-progress { color: var(--muted); font-size: 12px; margin-right: var(--space-2); }
  .manage-theme { padding: 4px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border);
    background: var(--surface); color: var(--fg); font-size: 12px; }
  .manage-delete:hover { color: var(--danger, #e5484d); }
  .manage-confirm { display: flex; align-items: center; gap: var(--space-2); font-size: 13px;
    color: var(--fg); }
  .manage-confirm .icon-button { width: auto; padding: 0 10px; }
  .manage-subpath { flex-basis: 100%; display: flex; align-items: center; gap: var(--space-2);
    padding-top: var(--space-2); }
  .manage-subpath-input { flex: 1; max-width: 320px; padding: 6px 10px; border-radius: var(--radius-sm);
    border: 1px solid var(--border); background: var(--surface); color: var(--fg); font-size: 13px; }
  .manage-note { color: var(--muted); font-size: 12px; }

  /* Motion: row collapse/fade on removal; gated by reduced-motion. */
  @keyframes manage-row-out {
    from { opacity: 1; } to { opacity: 0; transform: translateY(-2px); }
  }
  .manage-row.is-removing { animation: manage-row-out 200ms ease-out forwards; }
  @media (prefers-reduced-motion: reduce) {
    .manage-row, .manage-name { transition: none; }
    .manage-row.is-removing { animation: none; }
  }
  ```
  (The `.is-removing` class is reserved for the collapse/fade; deletion in this plan re-renders from the refreshed `projects` list. If a future task animates the exit it toggles this class before calling `onDelete`; the reduced-motion guard already covers it.)
- [ ] Run: `bunx electron-vite build` — expect a clean build (CSS compiles; renderer bundles).
- [ ] Manual smoke (commit body): `bun run dev` → confirm rows sit on `--surface` with a divider and hover-lift to `--surface-alt`; mono middle-truncated source; controls right-aligned; subpath editor wraps full-width.
- [ ] Commit: `style(manage): manage-view rows, controls, and reduced-motion-gated motion`

## Task 7 — Adversarial / integration sweep

**Files:** `tests/setDocsSubpath.test.ts`, `tests/manageProjects.test.ts` (append cases)

- [ ] Append a backend adversarial case to `tests/setDocsSubpath.test.ts` — clearing the subpath back to root is allowed and re-includes the root README:
  ```ts
  it('clearing the subpath (back to root) re-includes the root README', async () => {
    const spawnFn = repoSpawn({ 'README.md': '# Root', 'pkg/notes.md': '# Notes' })
    const p = await addGithubProject('o/r', { ref: 'main', docsSubpath: 'pkg' }, () => {}, { spawnFn })
    const res = await setDocsSubpath(p.id, '', () => {}, { spawnFn }) // '' → undefined (root)
    expect(res.docCount).toBe(2)
    expect(((await getProject(p.id)) as GithubProject).docsSubpath).toBeUndefined()
    await selectProject(p.id)
    expect((await getDoc(p.id, 'README.md')).content).toContain('# Root')
  })
  ```
- [ ] Run: `bun test tests/setDocsSubpath.test.ts` — expect PASS.
- [ ] Append a renderer adversarial case to `tests/manageProjects.test.ts` — the 0-doc note shows after a successful rebuild that found nothing, distinct from the collision error:
  ```ts
  it('shows the 0-doc note when a subpath rebuild finds no docs', async () => {
    await renderMP([gh], { onSetDocsSubpath: async () => ({ docCount: 0 }) })
    await act(async () => { (container.querySelector('[data-action="edit-subpath"]') as HTMLButtonElement).click() })
    const input = container.querySelector('[data-field="docsSubpath"]') as HTMLInputElement
    await act(async () => { setValue(input, 'empty') })
    await act(async () => { (container.querySelector('[data-action="commit-subpath"]') as HTMLButtonElement).click() })
    expect(container.textContent).toContain('No docs found at that subpath.')
    expect(container.textContent).not.toContain('Another project already uses')
  })
  ```
- [ ] Run: `bun test tests/manageProjects.test.ts` — expect PASS.
- [ ] Run the full suite: `bun test` — expect PASS.
- [ ] Run: `bun run typecheck` — expect PASS. Run `bunx electron-vite build` — expect a clean build.
- [ ] Commit: `test(manage): adversarial coverage — subpath clear-to-root and 0-doc note`

---

## Self-Review Notes

**Spec coverage (design spec → tasks):**
1. Shared `ThemeChoice` + narrowed `themeId` + `ipc.ts` `updateSettings` handler alignment → **Task 1** (the `IpcApi.setDocsSubpath` interface method moved to **Task 3** so it lands with its preload bridge and typecheck stays green).
2. Backend `setDocsSubpath` (collision throws — tagged `code: 'collision'` — without mutation; concurrent-build guard tagged `code: 'build-in-progress'`; success purges cache + rebuilds currentRef + records; non-github rejected; no-op on unchanged subpath; **only reloads `active` when editing the active project**, else derives result from cache) + registry identity-collision helper → **Task 2**.
3. `IpcApi.setDocsSubpath` interface + IPC `projects:setDocsSubpath` (streamed) + preload bridge → **Task 3**.
4. `ManageProjects` component — rows (name / mono-mid-truncated source / type chip / count / always-visible controls), inline rename (blank→prior name), compact per-row theme select (Global/Dark/Light/System), github docsSubpath inline editor with busy/collision/generic-rebuild-error/0-doc states (error copy branches on the backend's structured `code`), inline two-step delete, building-disabled controls, sort (Name/Type/Recently built) + filter (name+source) with first-run AND filtered-empty states → **Task 4**.
5. App + TopBar wiring — `view` toggle, Done, per-project document-theme resolution, delete-active handling (one App-level jsdom test), preserve-if-present open doc on re-scope, refresh-after-mutation → **Task 5**.
6. `.manage-*` styles + motion (row collapse/fade gated by `prefers-reduced-motion`) → **Task 6**.
7. Adversarial sweep (clear-to-root; 0-doc-note vs collision) → **Task 7**.

**Verbatim copy (from the spec copy table) used in the plan:** toggle tooltip/aria "Manage projects"; header "Manage Projects"; exit "Done"; empty state "No projects yet — add one to get started." + "Add project"; filter placeholder "Filter projects…"; sort options "Sort: Name" / "Sort: Type" / "Sort: Recently built"; filtered-empty "No projects match \"<query>\"." + "Clear filter"; docsSubpath placeholder "docs subpath (e.g. docs)"; collision "Another project already uses that repo + subpath."; generic rebuild failure "Couldn't rebuild at that subpath."; 0-doc note "No docs found at that subpath."; delete confirm "Delete <name>?" + "Cancel" / "Delete"; count "{n} docs" / "{n} branches"; type chips "local" / "github" (rendered from `project.type`).

**Type consistency:**
- `ThemeChoice` is defined once in `src/shared/types.ts`; `lib/theme.ts` re-exports it (existing `Settings.tsx` import keeps working). `ProjectBase.themeId` and the `updateProjectSettings` patch both use it.
- `setDocsSubpath` returns `{ tree, docCount }` consistently across `IpcApi` (Task 3), projectService (Task 2), the preload bridge (Task 3), and App's `manageSetDocsSubpath` (which narrows to `{ docCount }` for the component prop — Task 5). The `ManageProjects` `onSetDocsSubpath` prop type is `(id, subpath) => Promise<{ docCount: number }>` (Task 4) and the App handler satisfies it.
- The component's data-attribute contract (`data-row`, `data-chip`, `data-count`, `data-source`, `data-role="filter|sort|theme-select"`, `data-field="rename|docsSubpath"`, `data-action="select|rename|edit-subpath|commit-subpath|delete|confirm-delete|cancel-delete|add-project|clear-filter|done|toggle-manage"`) is identical between the tests (Tasks 4–5, 7) and the implementation.

**Reconciliation decisions / assumptions (flag for review):**
- **`ThemeChoice` shared-type question:** resolved by promoting `ThemeChoice` + a runtime `THEME_CHOICES` into `src/shared/types.ts` and re-exporting from `lib/theme.ts` (single source of truth, DRYs the existing `CHOICES` list). The alternative — leaving `ThemeChoice` in the renderer and typing `themeId` as a bare union in `shared` — would duplicate the literal set across the boundary; rejected.
- **Clearing the per-project theme override:** the renderer sends `updateProjectSettings(id, { themeId: undefined })`. `registry.updateProject` spreads the patch then `JSON.stringify` (which omits `undefined` keys), so the persisted record drops `themeId`; the in-memory result has `themeId: undefined` (falsy) so App resolves to the global document theme. This is the "Global clears the override" mechanism — no new registry code needed.
- **Collision vs. generic-failure vs. 0-doc surfaces:** the backend throws a **tagged** error — `code: 'collision'` for an identity clash, `code: 'build-in-progress'` for the concurrency guard, and an untagged error for network/clone/build failures. The renderer's `commitSubpath` catch branches on `code === 'collision'` (with a `/collision/i` message fallback in case the code is stripped crossing IPC) → inline collision copy "Another project already uses that repo + subpath."; everything else (build-in-progress, build failure) → generic copy "Couldn't rebuild at that subpath."; the field stays open in both cases. A 0-doc result is a **successful** rebuild returning `docCount === 0` → a distinct inline note "No docs found at that subpath." Task 4 tests cover both a collision and a non-collision reject.
- **Purge-all-refs, rebuild-current-only:** `setDocsSubpath` purges every cached ref (discovery scope changed) but only rebuilds `currentRef`. Other `refs[]` records persist and are rebuilt on demand by the existing `switchRef`/`hasCache` path. Matches the spec ("purge the cache (all refs) and rebuild currentRef").
- **Rename vs. select on the name:** the spec's "click rename (or the name)" conflicts with "selecting a project from the list returns to docs". Resolved: the **name** selects (returns to docs); a dedicated **pencil** button renames.
- **`removeProject` already purges cache:** the existing `projects:remove` IPC handler calls `purgeProjectCache(id)` before `removeProject(id)`, so delete needs no new backend — the Manage view reuses it (Task 5 `manageDelete`).
- **Motion:** row removal currently re-renders from the refreshed `projects` array (instant). A `.is-removing` collapse/fade class + reduced-motion guard is shipped in CSS (Task 6) and reserved for an explicit exit animation; not wired to a timer in this plan to keep delete deterministic and test-stable.
- **App-glue testing:** the TopBar toggle has a real red/green unit test (`tests/topBarManage.test.ts`), and delete-active — the one App path with destructive state cleanup — gets a single focused App-level jsdom integration test (`tests/appDeleteActive.test.ts`: mock `window.api`, select then delete the active project, assert the sidebar unmounts and the neutral prompt returns). The remaining App paths stay on the documented manual smoke; no broad full-App harness is scaffolded.
- **Active-project preservation on re-scope:** `setDocsSubpath` mirrors `rebuildProject` — it only reloads module-level `active` when the edited project IS the active one; for any other project it derives `{ tree, docCount }` from the rebuilt cache (`readCache`) so editing a background project never hijacks `active`. App-side, when the edited project is active, the re-scoped tree replaces the old one and the open `docPath` is kept if it still exists in the new tree (via `treeHasPath`), else cleared with `resetDocState`.
- **Concurrency guard scope:** `setDocsSubpath` refuses a second concurrent build for the same id (tagged `build-in-progress`). Applying the same guard to the older `switchRef`/`rebuildProject` entrypoints is a deliberate follow-up, out of Plan 3 scope.

**Scope honored:** single-row actions only (no multi-select/bulk); no ref-management beyond the existing branch switcher; chrome theming and the full theming editor remain Plan 5; file-watch / session memory / ⌘K remain Plan 4.
