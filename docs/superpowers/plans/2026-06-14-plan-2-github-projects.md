# Plan 2 — GitHub Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each task is TDD: write a failing test, run it (expect fail), implement complete code (no placeholders), run it (expect pass), commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add end-to-end (basic) GitHub Project support to the doc-viewer Electron app: add a GitHub repo by `https` URL or `owner/repo` shorthand, shallow-clone it to read its docs, build a per-ref on-disk cache (Documents + nav tree + serialized search index), delete the clone, then browse/search the cached content offline. Add a branch switcher (per-ref cache, ADR-0002), cancelable builds with live progress, and a `docsSubpath` override of docs-folder auto-scoping (ADR-0004). The read path branches on `Project.type` (ADR-0001): local stays live/in-memory, github reads from cache.

**Architecture:** The Electron **main** process owns all Node work. A GitHub build is a pipeline: `clone (system git, arg array) → discover (with optional docsSubpath) → parse → index → write atomic per-ref cache → delete clone`, emitting progress over IPC and cancelable via an `AbortController`. The **registry** (`projects.json`) gains a discriminated `github` variant tracking `refs[]` and `currentRef`; identity is `(normalized source, docsSubpath)` with the ref excluded. **projectService** keeps the active-project model but branches the read path: github `selectProject`/`getDoc`/`search` read from the deserialized cache, local stays live. The **preload** bridge exposes the new typed surface plus a streamed `onBuildProgress`. The **renderer** gains an Add-Project modal (Local | GitHub) with live progress + Cancel, a github branch switcher, and a per-type Rebuild label ("Pull latest" / "Reindex").

**Tech Stack:** Electron, electron-vite, React 19, TypeScript, MiniSearch (serialized to/from cache), system **git** via `node:child_process` `spawn` (argument array, never a shell string; `--depth 1 --single-branch`, no submodule recursion, `GIT_TERMINAL_PROMPT=0`), Node `fs/promises` (atomic temp-dir + rename), `bun test` (native runner, `import from 'bun:test'`), jsdom (renderer DOM env via `bunfig.toml` preload).

**Spec:** `docs/superpowers/specs/2026-06-14-doc-viewer-design.md` · **Glossary:** `CONTEXT.md` · **ADRs:** `docs/adr/0001` (local-live/github-cached read paths), `0002` (branch switcher / ref-excluded-from-identity / per-ref cache), `0004` (docs-folder auto-scoping).

**Scope split (explicit):** GitHub support is large, so this plan is split into **Plan 2a (backend)** — Tasks 1–10: types, source parsing, clone, discover override, index (de)serialization, disk cache, build orchestration, registry, projectService read path, IPC/preload — and **Plan 2b (UI)** — Tasks 11–14: Add-Project modal, branch switcher, Rebuild action + App wiring, adversarial sweep. 2a is independently shippable and fully testable headless; 2b layers the renderer on top. Implement 2a first.

**Reconciliation with current code (read before starting):**
- The registry/IPC/projectService are **local-only today**. `Project.type` is the literal `'local'`; there is no disk cache, no clone, no ref machinery.
- Existing IPC names are **method-per-operation** (`addLocalProject`, not the spec's unified `addProject({type,...})`). This plan **keeps that convention** and adds `addGithubProject` as a sibling method (does **not** introduce `addProject`). Noted again in Self-Review.
- `selectProject(id)` returns `{ tree, docCount }` — preserved for both types.
- `discover(root)` / `discoverDetailed(root)` exist; this plan **adds an optional second `options` argument** (`{ docsSubpath? }`) without breaking existing callers.
- `buildIndex(sections)` exists; this plan **factors its options into a shared const** and adds `serializeIndex` / `loadIndex`.
- `buildTree` currently lives privately inside `projectService.ts`; this plan **extracts it to `src/main/tree.ts`** so the github build can reuse it.

---

## File Structure

```
CREATED
  src/main/util/github.ts                 # parse/normalize GitHub source; default name; identity helpers
  src/main/pipeline/clone.ts              # system git shallow clone (arg array), default-ref resolve, cancel+cleanup
  src/main/pipeline/build.ts              # github build orchestration (clone→discover→parse→index→cache→delete)
  src/main/cache.ts                       # per-ref atomic disk cache (manifest/docs/search-index), version gate, sweep
  src/main/tree.ts                        # buildTree (extracted from projectService for reuse)
  src/renderer/src/components/AddProjectModal.tsx   # Local | GitHub add flow + live progress + Cancel
  src/renderer/src/components/BranchSwitcher.tsx    # github ref switcher (switch/add/remove)
  tests/github.test.ts                    # source parsing/normalization/identity (pure)
  tests/clone.test.ts                     # git arg construction + error/cancel/cleanup (mocked spawn)
  tests/cache.test.ts                     # roundtrip, corrupt, version mismatch, atomicity, purge, sweep
  tests/build.test.ts                     # orchestration w/ fake spawn: progress, cancel, cleanup, docsSubpath
  tests/githubRegistry.test.ts            # addGithubProject dedup-by-identity, recordRef, currentRef, removeRef
  tests/githubProjectService.test.ts      # select/getDoc/search from cache; switchRef; cancelBuild

MODIFIED
  src/shared/types.ts                     # discriminated Project union (LocalProject|GithubProject), RefInfo, BuildProgress, IpcApi additions
  src/main/registry.ts                    # addGithubProject, recordRef, setCurrentRef, removeRefRecord; updateProject patch typing
  src/main/projectService.ts              # type-branched read path, loadGithubRef, switchRef/addRef/removeRef, rebuildProject, cancelBuild; use src/main/tree.ts
  src/main/pipeline/discover.ts           # optional { docsSubpath } option overriding auto-scoping
  src/main/pipeline/index.ts             # INDEX_OPTIONS const; serializeIndex; loadIndex
  src/main/paths.ts                       # cacheRoot/projectCacheDir/refCacheDir helpers
  src/main/ipc.ts                         # register all new handlers; wire onBuildProgress via e.sender.send
  src/preload/index.ts                    # typed bridge for all new methods + onBuildProgress subscription
  src/renderer/src/App.tsx                # modal state, github add/rebuild/switch wiring, type-aware UI
  src/renderer/src/components/TopBar.tsx  # Add opens modal; branch switcher slot; per-type Rebuild button
  src/renderer/src/styles.css             # modal tabs/fields, progress, branch switcher chrome
```

---

# Plan 2a — Backend (clone / cache / refs / IPC)

## Task 1 — Types: discriminated `Project` union, `RefInfo`, `BuildProgress`, `IpcApi` extensions

**Files:** `src/shared/types.ts`

- [ ] Write a failing test `tests/github.test.ts` (type/exports smoke for now; expanded in Task 2). Create the file with:
  ```ts
  import { describe, it, expect } from 'bun:test'
  import type { Project, GithubProject, LocalProject, RefInfo, BuildProgress } from '../src/shared/types'

  describe('types: Project union', () => {
    it('discriminates local vs github by type', () => {
      const local: LocalProject = {
        id: 'a', name: 'x', type: 'local', source: '/tmp/x', addedAt: 'now', status: 'ok'
      }
      const ref: RefInfo = { ref: 'main', lastBuiltAt: 'now', docCount: 3 }
      const gh: GithubProject = {
        id: 'b', name: 'o/r', type: 'github', source: 'https://github.com/o/r',
        refs: [ref], currentRef: 'main', addedAt: 'now', status: 'ok'
      }
      const projects: Project[] = [local, gh]
      const types = projects.map((p) => p.type).sort()
      expect(types).toEqual(['github', 'local'])
      const progress: BuildProgress = { projectId: 'b', ref: 'main', stage: 'cloning' }
      expect(progress.stage).toBe('cloning')
    })
  })
  ```
- [ ] Run: `bun test tests/github.test.ts` — expect FAIL (the new exports don't exist yet; TS/import error).
- [ ] Implement in `src/shared/types.ts`. Replace the single `Project` interface with a discriminated union and add the new types. Keep `DocKind`, `NavFolder`, `NavDoc`, `NavNode`, `Section`, `ParsedDoc`, `SearchResult`, `ProjectStatus` exactly as they are. Replace the `Project` block and the `IpcApi` block:
  ```ts
  // Persisted project records. `type` discriminates the union.
  export type ProjectStatus = 'ok' | 'unavailable' | 'building' | 'error'

  interface ProjectBase {
    id: string // UUID
    name: string // editable display label
    addedAt: string // ISO timestamp
    status: ProjectStatus
    themeId?: string // per-project theme override (Plan 5); absent = use global
  }

  export interface LocalProject extends ProjectBase {
    type: 'local'
    source: string // absolute directory path
    lastBuiltAt?: string
    docCount?: number
  }

  // One cached ref of a GitHub Project (branch/tag/commit). ADR-0002.
  export interface RefInfo {
    ref: string
    lastBuiltAt: string
    docCount: number
  }

  export interface GithubProject extends ProjectBase {
    type: 'github'
    source: string // normalized https://github.com/owner/repo
    docsSubpath?: string // overrides docs-folder auto-scoping (ADR-0004); part of identity (ADR-0002)
    refs: RefInfo[] // cached refs
    currentRef: string // selected ref; '' only transiently during first build
  }

  export type Project = LocalProject | GithubProject

  // A patch accepted by registry.updateProject — partial of either variant.
  export type ProjectPatch = Partial<Omit<LocalProject, 'id' | 'type'>> &
    Partial<Omit<GithubProject, 'id' | 'type'>>

  // Pipeline progress streamed to the renderer during a github build.
  export type BuildStage =
    | 'cloning'
    | 'resolving'
    | 'discovering'
    | 'parsing'
    | 'indexing'
    | 'caching'
    | 'cleanup'
    | 'done'
    | 'error'
  export interface BuildProgress {
    projectId: string
    ref: string
    stage: BuildStage
    message?: string
    docCount?: number
    skipped?: number
  }
  ```
- [ ] Extend the `IpcApi` interface (keep the existing methods; add the github surface). Replace the `IpcApi` block with:
  ```ts
  export interface IpcApi {
    listProjects(): Promise<Project[]>
    addLocalProject(source: string, name?: string): Promise<Project>
    addGithubProject(
      source: string,
      opts?: { name?: string; ref?: string; docsSubpath?: string }
    ): Promise<Project>
    removeProject(id: string): Promise<void>
    updateProjectSettings(
      id: string,
      patch: { name?: string; docsSubpath?: string; themeId?: string }
    ): Promise<Project>
    rebuildProject(id: string): Promise<void> // "Pull latest" (github) / "Reindex" (local)
    cancelBuild(id: string): Promise<void>
    listRefs(id: string): Promise<RefInfo[]>
    switchRef(id: string, ref: string): Promise<{ tree: NavNode[]; docCount: number }>
    addRef(id: string, ref: string): Promise<{ tree: NavNode[]; docCount: number }>
    removeRef(id: string, ref: string): Promise<void>
    selectProject(id: string): Promise<{ tree: NavNode[]; docCount: number }>
    getDoc(id: string, relativePath: string): Promise<{ kind: DocKind; content: string }>
    search(id: string, query: string): Promise<SearchResult[]>
    pickDirectory(): Promise<string | null>
    onBuildProgress(cb: (p: BuildProgress) => void): () => void // returns unsubscribe
  }
  ```
- [ ] Run: `bun test tests/github.test.ts` — expect PASS.
- [ ] Run: `bun run typecheck` — expect FAIL (existing `registry.ts`/`projectService.ts` reference the old flat `Project`; that's fixed in Tasks 8–9). Note the failure is expected and confined to those files; do not fix yet.
- [ ] Commit: `feat(types): add github Project variant, RefInfo, BuildProgress, IpcApi surface`

## Task 2 — GitHub source parsing / normalization (pure)

**Files:** `src/main/util/github.ts`, `tests/github.test.ts`

- [ ] Add failing tests to `tests/github.test.ts` (append to the file from Task 1):
  ```ts
  import { parseGithubSource, defaultGithubName, githubIdentity } from '../src/main/util/github'

  describe('parseGithubSource', () => {
    it('normalizes owner/repo shorthand to an https url', () => {
      const s = parseGithubSource('octocat/Hello-World')
      expect(s).toEqual({ owner: 'octocat', repo: 'Hello-World', url: 'https://github.com/octocat/Hello-World' })
    })
    it('accepts a full https url and strips .git + trailing slash', () => {
      expect(parseGithubSource('https://github.com/octocat/Hello-World.git/').url)
        .toBe('https://github.com/octocat/Hello-World')
    })
    it('accepts http and upgrades to https', () => {
      expect(parseGithubSource('http://github.com/a/b').url).toBe('https://github.com/a/b')
    })
    it('trims surrounding whitespace', () => {
      expect(parseGithubSource('  a/b  ').url).toBe('https://github.com/a/b')
    })
    it('rejects garbage and non-github hosts', () => {
      expect(() => parseGithubSource('not a repo')).toThrow(/GitHub source/i)
      expect(() => parseGithubSource('https://gitlab.com/a/b')).toThrow(/GitHub source/i)
      expect(() => parseGithubSource('')).toThrow(/GitHub source/i)
    })
  })

  describe('defaultGithubName / githubIdentity', () => {
    it('derives owner/repo, appending the subpath when scoped', () => {
      const s = parseGithubSource('octocat/Hello-World')
      expect(defaultGithubName(s)).toBe('octocat/Hello-World')
      expect(defaultGithubName(s, 'docs')).toBe('octocat/Hello-World /docs')
    })
    it('identity excludes ref but includes source + docsSubpath', () => {
      expect(githubIdentity('https://github.com/o/r', undefined))
        .toBe(githubIdentity('https://github.com/o/r', undefined))
      expect(githubIdentity('https://github.com/o/r', 'docs'))
        .not.toBe(githubIdentity('https://github.com/o/r', undefined))
    })
  })
  ```
- [ ] Run: `bun test tests/github.test.ts` — expect FAIL (`src/main/util/github.ts` missing).
- [ ] Implement `src/main/util/github.ts`:
  ```ts
  export interface GithubSource {
    owner: string
    repo: string
    url: string // normalized https://github.com/owner/repo
  }

  const OWNER = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?'
  const REPO = '[A-Za-z0-9._-]+?'

  function make(owner: string, repo: string): GithubSource {
    const cleanRepo = repo.replace(/\.git$/i, '')
    return { owner, repo: cleanRepo, url: `https://github.com/${owner}/${cleanRepo}` }
  }

  // Accept a full http(s) github.com URL or the `owner/repo` shorthand.
  // SSH-URL input is deferred (spec); private https repos still auth via the
  // user's git credential helper at clone time.
  export function parseGithubSource(input: string): GithubSource {
    const s = (input ?? '').trim()
    if (!s) throw new Error(`Unrecognized GitHub source: ${JSON.stringify(input)}`)

    const url = new RegExp(`^https?://github\\.com/(${OWNER})/(${REPO})(?:\\.git)?/?$`, 'i')
    const m1 = url.exec(s)
    if (m1) return make(m1[1], m1[2])

    if (!s.includes('://') && !s.startsWith('git@')) {
      const short = new RegExp(`^(${OWNER})/(${REPO})(?:\\.git)?$`)
      const m2 = short.exec(s)
      if (m2) return make(m2[1], m2[2])
    }

    throw new Error(`Unrecognized GitHub source: ${JSON.stringify(input)}`)
  }

  export function defaultGithubName(src: GithubSource, docsSubpath?: string): string {
    const base = `${src.owner}/${src.repo}`
    const sub = docsSubpath?.trim()
    return sub ? `${base} /${sub.replace(/^\/+|\/+$/g, '')}` : base
  }

  // Identity excludes the ref (ADR-0002): same repo on two branches = one Project.
  export function githubIdentity(url: string, docsSubpath?: string): string {
    return `${url} ${docsSubpath?.trim() || ''}`
  }
  ```
- [ ] Run: `bun test tests/github.test.ts` — expect PASS.
- [ ] Commit: `feat(github): pure source parser, default name, and ref-excluded identity`

## Task 3 — Clone pipeline: system git (arg array), default-ref resolve, cancel + cleanup

**Files:** `src/main/pipeline/clone.ts`, `tests/clone.test.ts`

- [ ] Write failing tests `tests/clone.test.ts`. The fake spawn is a minimal `EventEmitter` with `stdout`/`stderr` emitters and a `kill` spy — no network:
  ```ts
  import { describe, it, expect } from 'bun:test'
  import { EventEmitter } from 'node:events'
  import { writeFile, stat, rm } from 'node:fs/promises'
  import { join } from 'node:path'
  import { buildGitArgs, cloneRepo, resolveDefaultRef } from '../src/main/pipeline/clone'

  // A fake child process. `behavior` decides how it resolves after spawn.
  function makeFakeSpawn(behavior: {
    onArgs?: (cmd: string, args: string[]) => void
    writeFile?: { name: string; content: string } // simulate clone output into dest
    stdout?: string
    stderrOnFail?: string
    exitCode?: number
    neverClose?: boolean
  }) {
    const killed: string[] = []
    const fn = (cmd: string, args: string[]) => {
      behavior.onArgs?.(cmd, args)
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter
        stderr: EventEmitter
        kill: (sig?: string) => void
      }
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.kill = (sig = 'SIGTERM') => {
        killed.push(sig)
        // A killed git process exits; emit close so the abort path resolves.
        queueMicrotask(() => child.emit('close', null))
      }
      queueMicrotask(async () => {
        if (behavior.neverClose) return
        const dest = args[args.length - 1]
        if (behavior.writeFile) await writeFile(join(dest, behavior.writeFile.name), behavior.writeFile.content)
        if (behavior.stdout) child.stdout.emit('data', behavior.stdout)
        const code = behavior.exitCode ?? 0
        if (code !== 0 && behavior.stderrOnFail) child.stderr.emit('data', behavior.stderrOnFail)
        child.emit('close', code)
      })
      return child
    }
    return { fn: fn as never, killed }
  }

  describe('buildGitArgs', () => {
    it('produces a shallow single-branch clone with a -- separator', () => {
      const args = buildGitArgs('https://github.com/o/r', 'main', '/tmp/dest')
      expect(args).toEqual([
        'clone', '--depth', '1', '--single-branch', '--no-tags',
        '--branch', 'main', '--', 'https://github.com/o/r', '/tmp/dest'
      ])
    })
    it('omits --branch when no ref is given (default branch clone)', () => {
      const args = buildGitArgs('https://github.com/o/r', undefined, '/tmp/dest')
      expect(args).not.toContain('--branch')
      expect(args).toContain('--single-branch')
      expect(args[args.length - 2]).toBe('https://github.com/o/r')
      expect(args[args.length - 1]).toBe('/tmp/dest')
    })
    it('never recurses submodules', () => {
      expect(buildGitArgs('u', 'r', 'd').some((a) => /recurse/i.test(a))).toBe(false)
    })
  })

  describe('cloneRepo', () => {
    it('clones into a temp dir and returns the path on success', async () => {
      const { fn } = makeFakeSpawn({ writeFile: { name: 'README.md', content: '# hi' } })
      const dir = await cloneRepo({ source: 'https://github.com/o/r', ref: 'main', spawnFn: fn })
      expect((await stat(join(dir, 'README.md'))).isFile()).toBe(true)
      await rm(dir, { recursive: true, force: true })
    })

    it('rejects with git stderr and removes the temp dir on failure', async () => {
      let captured = ''
      const { fn } = makeFakeSpawn({
        exitCode: 128,
        stderrOnFail: "fatal: repository 'x' not found",
        onArgs: (_c, a) => { captured = a[a.length - 1] }
      })
      await expect(cloneRepo({ source: 'https://github.com/o/r', ref: 'main', spawnFn: fn }))
        .rejects.toThrow(/not found/)
      await expect(stat(captured)).rejects.toThrow() // temp dir cleaned up
    })

    it('aborts the child and cleans up when canceled', async () => {
      const { fn, killed } = makeFakeSpawn({ neverClose: true })
      const ac = new AbortController()
      const p = cloneRepo({ source: 'https://github.com/o/r', ref: 'main', signal: ac.signal, spawnFn: fn })
      queueMicrotask(() => ac.abort())
      await expect(p).rejects.toThrow(/cancel/i)
      expect(killed.length).toBeGreaterThan(0)
    })
  })

  describe('resolveDefaultRef', () => {
    it('returns the abbreviated HEAD branch name', async () => {
      const { fn } = makeFakeSpawn({ stdout: 'main\n' })
      expect(await resolveDefaultRef('/tmp/clone', fn)).toBe('main')
    })
  })
  ```
- [ ] Run: `bun test tests/clone.test.ts` — expect FAIL (`clone.ts` missing).
- [ ] Implement `src/main/pipeline/clone.ts`:
  ```ts
  import { spawn } from 'node:child_process'
  import { mkdtemp, rm } from 'node:fs/promises'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'

  export type SpawnFn = typeof spawn

  export interface CloneOptions {
    source: string // normalized https url
    ref?: string // omit for the repo's default branch
    signal?: AbortSignal
    spawnFn?: SpawnFn
  }

  // SECURITY: git is invoked with an argument ARRAY (never a shell string). The
  // `--` separator prevents a malicious source/ref from being parsed as a flag.
  // Shallow (`--depth 1 --single-branch --no-tags`); no submodule recursion (git
  // does not recurse submodules unless asked). GIT_TERMINAL_PROMPT=0 disables
  // interactive credential prompts.
  export function buildGitArgs(source: string, ref: string | undefined, dest: string): string[] {
    const args = ['clone', '--depth', '1', '--single-branch', '--no-tags']
    if (ref) args.push('--branch', ref)
    args.push('--', source, dest)
    return args
  }

  interface RunResult {
    stdout: string
  }

  function runGit(
    spawnFn: SpawnFn,
    args: string[],
    signal?: AbortSignal
  ): Promise<RunResult> {
    return new Promise<RunResult>((resolve, reject) => {
      const child = spawnFn('git', args, {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      let stdout = ''
      let stderr = ''
      child.stdout?.on('data', (d) => { stdout += String(d) })
      child.stderr?.on('data', (d) => { stderr += String(d) })

      const onAbort = (): void => { child.kill('SIGTERM') }
      if (signal) {
        if (signal.aborted) child.kill('SIGTERM')
        else signal.addEventListener('abort', onAbort)
      }

      child.on('error', (err) => {
        signal?.removeEventListener('abort', onAbort)
        reject(err)
      })
      child.on('close', (code) => {
        signal?.removeEventListener('abort', onAbort)
        if (signal?.aborted) {
          reject(new Error('Build canceled'))
          return
        }
        if (code === 0) resolve({ stdout })
        else reject(new Error(`git ${args[0]} failed (exit ${code ?? 'null'}): ${stderr.trim()}`))
      })
    })
  }

  // Shallow-clones into a fresh os.tmpdir() directory. On any failure/cancel the
  // temp dir is removed before the error propagates; on success the caller owns
  // (and must later delete) the returned path.
  export async function cloneRepo(opts: CloneOptions): Promise<string> {
    const spawnFn = opts.spawnFn ?? spawn
    const dest = await mkdtemp(join(tmpdir(), 'dv-clone-'))
    try {
      await runGit(spawnFn, buildGitArgs(opts.source, opts.ref, dest), opts.signal)
    } catch (err) {
      await rm(dest, { recursive: true, force: true })
      throw err
    }
    return dest
  }

  // Resolve the checked-out branch name of a clone (used when no ref was requested
  // so we record the real default branch as the ref name).
  export async function resolveDefaultRef(dir: string, spawnFn: SpawnFn = spawn): Promise<string> {
    const { stdout } = await runGit(spawnFn, ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'])
    return stdout.trim() || 'HEAD'
  }
  ```
- [ ] Run: `bun test tests/clone.test.ts` — expect PASS.
- [ ] Commit: `feat(clone): shallow git clone via arg array with cancel and cleanup`

## Task 4 — Discover: optional `docsSubpath` override of auto-scoping

**Files:** `src/main/pipeline/discover.ts`, `tests/discover.test.ts`

- [ ] Add a failing test to `tests/discover.test.ts` (append). It reuses the existing `scoped-docs` fixture (which has `docs/`, `documentation/`, `src/`, `adr/`). With an explicit `docsSubpath: 'src'` the auto-scoping is overridden and discovery is confined to `src/`:
  ```ts
  describe('discover (explicit docsSubpath override)', () => {
    it('confines discovery to the subpath, ignoring docs/ auto-scoping', async () => {
      const docs = await discover(scopedRoot, { docsSubpath: 'src' })
      const paths = docs.map((d) => d.path).sort()
      expect(paths).toContain('src/internal.md')
      // Auto-scoping would have surfaced these; the override suppresses them.
      expect(paths).not.toContain('README.md')
      expect(paths).not.toContain('docs/guide.md')
      expect(paths).not.toContain('documentation/extra.md')
    })

    it('rejects a traversal docsSubpath', async () => {
      await expect(discover(scopedRoot, { docsSubpath: '../etc' })).rejects.toThrow(/outside project/i)
    })

    it('reports an unavailable subpath as a single skip (no docs)', async () => {
      const { docs, skipped } = await discoverDetailed(scopedRoot, { docsSubpath: 'nope' })
      expect(docs).toHaveLength(0)
      expect(skipped.some((s) => /readdir failed|outside/i.test(s.reason))).toBe(true)
    })
  })
  ```
- [ ] Run: `bun test tests/discover.test.ts` — expect FAIL (the option arg doesn't exist).
- [ ] Implement in `src/main/pipeline/discover.ts`. Add an import and an options param; when `docsSubpath` is set, walk only that subtree (paths still relative to `root`) and skip the auto-scoping branch. Change the signatures and the auto-scoping section:
  - Add at the top, after the existing imports:
    ```ts
    import { safeResolve } from '../util/pathsafe'

    export interface DiscoverOptions {
      docsSubpath?: string
    }
    ```
  - Change `discoverDetailed`'s signature to `export async function discoverDetailed(root: string, options: DiscoverOptions = {}): Promise<DiscoverResult> {` and, immediately before the `// Auto-scoping:` block (the `let rootEntries` line), insert the override branch:
    ```ts
    // Explicit docsSubpath (ADR-0004 override): confine discovery to the subpath,
    // bypassing docs-folder auto-scoping. Paths stay relative to `root`.
    const sub = options.docsSubpath?.trim().replace(/^\/+|\/+$/g, '')
    if (sub) {
      let base: string
      try {
        base = safeResolve(root, sub) // throws on traversal
      } catch (err) {
        throw err
      }
      try {
        await readdir(base) // surface a missing subpath as a clean skip
      } catch (err) {
        return { docs: [], skipped: [{ path: sub, reason: `readdir failed: ${(err as Error).message}` }] }
      }
      await walk(base)
      const mdSetSub = new Set(found.filter((f) => f.kind === 'md').map((f) => f.rel.replace(/\.md$/i, '')))
      const dedupedSub = found.filter((f) => {
        if (f.kind === 'html') {
          const b = f.rel.replace(/\.html$/i, '')
          if (mdSetSub.has(b)) {
            skipped.push({ path: f.rel, reason: 'generated html shadowed by .md sibling' })
            return false
          }
        }
        return true
      })
      const cappedSub = dedupedSub.slice(0, MAX_DOCS)
      if (dedupedSub.length > MAX_DOCS) {
        skipped.push({ path: '(many)', reason: `doc count capped at ${MAX_DOCS} (had ${dedupedSub.length})` })
      }
      return { docs: cappedSub.map((f) => ({ path: f.rel, kind: f.kind })), skipped }
    }
    ```
    (The existing 1A dedup + cap logic at the bottom of the function remains for the non-override paths; the override returns early with its own equivalent dedup/cap.)
  - Change the convenience wrapper to forward options:
    ```ts
    export async function discover(root: string, options: DiscoverOptions = {}): Promise<DiscoveredDoc[]> {
      return (await discoverDetailed(root, options)).docs
    }
    ```
- [ ] Run: `bun test tests/discover.test.ts` — expect PASS (existing discover tests still pass; the new override tests pass).
- [ ] Commit: `feat(discover): explicit docsSubpath override of docs-folder auto-scoping`

## Task 5 — Index (de)serialization for the cache

**Files:** `src/main/pipeline/index.ts`, `tests/index.test.ts`

- [ ] Add a failing test to `tests/index.test.ts` (append) covering a serialize → load roundtrip that preserves search + snippet behavior:
  ```ts
  import { buildIndex, serializeIndex, loadIndex, runSearch } from '../src/main/pipeline/index'
  import type { Section } from '../src/shared/types'

  const sections: Section[] = [
    { id: 'a.md#', docPath: 'a.md', docTitle: 'Alpha', headingId: '', headingText: '', depth: 0, text: 'install the widget' },
    { id: 'a.md#setup', docPath: 'a.md', docTitle: 'Alpha', headingId: 'setup', headingText: 'Setup', depth: 2, text: 'Setup run the setup script' }
  ]

  describe('index serialize/load', () => {
    it('roundtrips an index and reproduces search + snippet', () => {
      const original = buildIndex(sections)
      const json = serializeIndex(original)
      const restored = loadIndex(json, sections)
      const live = runSearch(original, 'setup')
      const cached = runSearch(restored, 'setup')
      expect(cached.map((r) => r.headingId)).toEqual(live.map((r) => r.headingId))
      expect(cached[0].snippet.length).toBeGreaterThan(0) // snippet needs the rebuilt section lookup
    })
  })
  ```
- [ ] Run: `bun test tests/index.test.ts` — expect FAIL (`serializeIndex`/`loadIndex` missing).
- [ ] Implement in `src/main/pipeline/index.ts`. Factor the options into a shared const and add the two functions. Replace the top of the file through `buildIndex` with:
  ```ts
  import MiniSearch from 'minisearch'
  import type { Section, SearchResult } from '@shared/types'

  const sectionById = new WeakMap<MiniSearch, Map<string, Section>>()

  // Single source of truth for index options — buildIndex and loadIndex must agree
  // (MiniSearch.loadJSON requires the same options used at build time).
  const INDEX_OPTIONS = {
    idField: 'id',
    fields: ['headingText', 'docTitle', 'docPath', 'text'],
    storeFields: ['docPath', 'docTitle', 'headingId', 'headingText'],
    searchOptions: {
      boost: { headingText: 4, docTitle: 3, docPath: 2, text: 1 },
      prefix: true,
      fuzzy: 0.2
    }
  } as const

  export function buildIndex(sections: Section[]): MiniSearch {
    const mini = new MiniSearch(INDEX_OPTIONS)
    mini.addAll(sections)
    sectionById.set(mini, new Map(sections.map((s) => [s.id, s])))
    return mini
  }

  // Serialize a built index to a JSON string for the disk cache.
  export function serializeIndex(index: MiniSearch): string {
    return JSON.stringify(index)
  }

  // Rebuild an index from cached JSON. The section lookup (needed for snippets and
  // result shaping) is reconstructed from the persisted sections.
  export function loadIndex(json: string, sections: Section[]): MiniSearch {
    const mini = MiniSearch.loadJSON(json, INDEX_OPTIONS)
    sectionById.set(mini, new Map(sections.map((s) => [s.id, s])))
    return mini
  }
  ```
  Leave `makeSnippet` and `runSearch` unchanged below.
- [ ] Run: `bun test tests/index.test.ts` — expect PASS.
- [ ] Commit: `feat(index): shared index options plus serialize/load for the cache`

## Task 6 — Disk cache: per-ref atomic store with version gate, purge, and sweep

**Files:** `src/main/paths.ts`, `src/main/cache.ts`, `tests/cache.test.ts`

- [ ] Write failing tests `tests/cache.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'bun:test'
  import { mkdtemp, rm, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import { setBaseDir } from '../src/main/paths'
  import {
    writeCache, readCache, hasCache, purgeProjectCache, sweepOrphans,
    CACHE_VERSION, type CacheData
  } from '../src/main/cache'
  import { projectCacheDir, refCacheDir } from '../src/main/paths'

  let dir: string
  function sampleData(version = CACHE_VERSION): CacheData {
    return {
      manifest: {
        cacheVersion: version, ref: 'main', builtAt: 'now', docCount: 1,
        tree: [{ type: 'doc', name: 'a.md', title: 'Alpha', path: 'a.md', kind: 'md' }],
        sections: [{ id: 'a.md#', docPath: 'a.md', docTitle: 'Alpha', headingId: '', headingText: '', depth: 0, text: 'hi' }]
      },
      docs: { 'a.md': { kind: 'md', content: '# Alpha' } },
      indexJson: '{"fake":"index"}'
    }
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dv-cache-'))
    setBaseDir(dir)
  })

  describe('cache', () => {
    it('roundtrips a ref cache', async () => {
      await writeCache('p1', 'main', sampleData())
      expect(await hasCache('p1', 'main')).toBe(true)
      const c = await readCache('p1', 'main')
      expect(c?.manifest.docCount).toBe(1)
      expect(c?.docs['a.md'].content).toBe('# Alpha')
      expect(c?.indexJson).toBe('{"fake":"index"}')
      await rm(dir, { recursive: true, force: true })
    })

    it('treats a version mismatch as stale (returns null)', async () => {
      await writeCache('p1', 'main', sampleData(CACHE_VERSION + 99))
      expect(await readCache('p1', 'main')).toBeNull()
      await rm(dir, { recursive: true, force: true })
    })

    it('treats a corrupt manifest as stale (returns null)', async () => {
      await writeCache('p1', 'main', sampleData())
      await writeFile(join(refCacheDir('p1', 'main'), 'manifest.json'), '{ not json', 'utf8')
      expect(await readCache('p1', 'main')).toBeNull()
      await rm(dir, { recursive: true, force: true })
    })

    it('returns null for a missing ref', async () => {
      expect(await readCache('p1', 'nope')).toBeNull()
      expect(await hasCache('p1', 'nope')).toBe(false)
      await rm(dir, { recursive: true, force: true })
    })

    it('encodes slash-bearing refs into a safe dir name', async () => {
      await writeCache('p1', 'feature/x', sampleData())
      const c = await readCache('p1', 'feature/x')
      expect(c?.docs['a.md'].content).toBe('# Alpha')
      // The on-disk dir name is not a nested path.
      const entries = await readdir(projectCacheDir('p1'))
      expect(entries.some((e) => e.includes('/'))).toBe(false)
      await rm(dir, { recursive: true, force: true })
    })

    it('overwrites an existing ref atomically without leaving temp dirs', async () => {
      await writeCache('p1', 'main', sampleData())
      const updated = sampleData()
      updated.manifest.docCount = 7
      await writeCache('p1', 'main', updated)
      expect((await readCache('p1', 'main'))?.manifest.docCount).toBe(7)
      const entries = await readdir(projectCacheDir('p1'))
      expect(entries.some((e) => e.startsWith('.tmp-'))).toBe(false)
      await rm(dir, { recursive: true, force: true })
    })

    it('purges all refs of a project', async () => {
      await writeCache('p1', 'main', sampleData())
      await writeCache('p1', 'dev', sampleData())
      await purgeProjectCache('p1')
      await expect(stat(projectCacheDir('p1'))).rejects.toThrow()
      await rm(dir, { recursive: true, force: true })
    })

    it('sweeps orphaned temp dirs left by an interrupted write', async () => {
      await mkdir(join(projectCacheDir('p1'), '.tmp-orphan'), { recursive: true })
      await sweepOrphans()
      const entries = await readdir(projectCacheDir('p1')).catch(() => [])
      expect(entries.some((e) => e.startsWith('.tmp-'))).toBe(false)
      await rm(dir, { recursive: true, force: true })
    })
  })
  ```
- [ ] Run: `bun test tests/cache.test.ts` — expect FAIL (`cache.ts` + path helpers missing).
- [ ] Implement the path helpers in `src/main/paths.ts` (append after `projectsFile`):
  ```ts
  export function cacheRoot(): string {
    return join(userDataDir(), 'cache')
  }
  export function projectCacheDir(id: string): string {
    return join(cacheRoot(), id)
  }
  // Refs may contain '/', ':' etc. encodeURIComponent yields a single safe dir name.
  export function refCacheDir(id: string, ref: string): string {
    return join(projectCacheDir(id), encodeURIComponent(ref))
  }
  ```
- [ ] Implement `src/main/cache.ts`:
  ```ts
  import { mkdir, mkdtemp, writeFile, readFile, rm, rename, readdir, access } from 'node:fs/promises'
  import { join } from 'node:path'
  import type { NavNode, Section, DocKind } from '@shared/types'
  import { cacheRoot, projectCacheDir, refCacheDir } from './paths'

  // Bump when the cache layout/contents change incompatibly; a mismatch is treated
  // as stale and auto-rebuilt (no migration).
  export const CACHE_VERSION = 1

  export interface CacheManifest {
    cacheVersion: number
    ref: string
    builtAt: string
    docCount: number
    tree: NavNode[]
    sections: Section[] // needed to rebuild the search lookup + snippets
  }

  export interface CacheData {
    manifest: CacheManifest
    docs: Record<string, { kind: DocKind; content: string }> // keyed by repo-relative path
    indexJson: string // serialized MiniSearch
  }

  const MANIFEST = 'manifest.json'
  const DOCS = 'docs.json'
  const INDEX = 'search-index.json'

  // Atomic write: assemble in a temp dir under the project dir, then swap it into
  // place. A crash/cancel mid-write leaves the prior ref cache intact; the leftover
  // temp dir is removed by sweepOrphans() on next launch.
  export async function writeCache(projectId: string, ref: string, data: CacheData): Promise<void> {
    const projDir = projectCacheDir(projectId)
    await mkdir(projDir, { recursive: true })
    const tmp = await mkdtemp(join(projDir, '.tmp-'))
    try {
      await writeFile(join(tmp, MANIFEST), JSON.stringify(data.manifest), 'utf8')
      await writeFile(join(tmp, DOCS), JSON.stringify(data.docs), 'utf8')
      await writeFile(join(tmp, INDEX), data.indexJson, 'utf8')
      const target = refCacheDir(projectId, ref)
      await rm(target, { recursive: true, force: true })
      await rename(tmp, target)
    } catch (err) {
      await rm(tmp, { recursive: true, force: true })
      throw err
    }
  }

  // Returns null when the ref is absent, corrupt, or a stale cacheVersion.
  export async function readCache(projectId: string, ref: string): Promise<CacheData | null> {
    const dir = refCacheDir(projectId, ref)
    try {
      const manifest = JSON.parse(await readFile(join(dir, MANIFEST), 'utf8')) as CacheManifest
      if (manifest.cacheVersion !== CACHE_VERSION) return null
      const docs = JSON.parse(await readFile(join(dir, DOCS), 'utf8')) as CacheData['docs']
      const indexJson = await readFile(join(dir, INDEX), 'utf8')
      return { manifest, docs, indexJson }
    } catch {
      // ENOENT or corrupt JSON → treat as no usable cache (rebuild upstream).
      return null
    }
  }

  export async function hasCache(projectId: string, ref: string): Promise<boolean> {
    try {
      await access(join(refCacheDir(projectId, ref), MANIFEST))
      return (await readCache(projectId, ref)) !== null
    } catch {
      return false
    }
  }

  export async function removeRefCache(projectId: string, ref: string): Promise<void> {
    await rm(refCacheDir(projectId, ref), { recursive: true, force: true })
  }

  export async function purgeProjectCache(projectId: string): Promise<void> {
    await rm(projectCacheDir(projectId), { recursive: true, force: true })
  }

  // Remove orphaned `.tmp-*` dirs left by interrupted writes. Best-effort.
  export async function sweepOrphans(): Promise<void> {
    let projects: string[]
    try {
      projects = await readdir(cacheRoot())
    } catch {
      return
    }
    for (const projectId of projects) {
      let entries: string[]
      try {
        entries = await readdir(projectCacheDir(projectId))
      } catch {
        continue
      }
      for (const entry of entries) {
        if (entry.startsWith('.tmp-')) {
          await rm(join(projectCacheDir(projectId), entry), { recursive: true, force: true })
        }
      }
    }
  }
  ```
- [ ] Run: `bun test tests/cache.test.ts` — expect PASS.
- [ ] Commit: `feat(cache): per-ref atomic disk cache with version gate, purge, and sweep`

## Task 7 — GitHub build orchestration

**Files:** `src/main/tree.ts` (extracted), `src/main/projectService.ts` (use the extracted tree), `src/main/pipeline/build.ts`, `tests/build.test.ts`

- [ ] First extract `buildTree` so both local and github builds share it. Create `src/main/tree.ts`:
  ```ts
  import type { NavNode, NavFolder, ParsedDoc } from '@shared/types'

  // Build a folder-mirroring nav tree from parsed docs, sorted alphabetically by
  // filename at every level.
  export function buildTree(docs: ParsedDoc[]): NavNode[] {
    const rootChildren: NavNode[] = []
    const folders = new Map<string, NavFolder>()

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
  ```
- [ ] In `src/main/projectService.ts`, delete the local `buildTree` function (lines defining `function buildTree(...)` through its closing brace) and add `import { buildTree } from './tree'` near the other imports. (Full projectService changes land in Task 9; this step only removes the duplicate so the extraction compiles.)
- [ ] Write failing tests `tests/build.test.ts`. The fake spawn materializes a tiny repo into the clone dir so discover/parse run for real:
  ```ts
  import { describe, it, expect, beforeEach } from 'bun:test'
  import { EventEmitter } from 'node:events'
  import { mkdtemp, rm, writeFile, mkdir, stat } from 'node:fs/promises'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import { setBaseDir } from '../src/main/paths'
  import { buildGithubRef, type BuildDeps } from '../src/main/pipeline/build'
  import { readCache } from '../src/main/cache'
  import type { GithubProject, BuildProgress } from '../src/shared/types'

  let base: string
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'dv-build-'))
    setBaseDir(base)
  })

  function project(over: Partial<GithubProject> = {}): GithubProject {
    return {
      id: 'p1', name: 'o/r', type: 'github', source: 'https://github.com/o/r',
      refs: [], currentRef: '', addedAt: 'now', status: 'building', ...over
    }
  }

  // Fake spawn that writes a small repo into the clone dest then exits 0.
  function repoSpawn(files: Record<string, string>): BuildDeps['spawnFn'] {
    const fn = (cmd: string, args: string[]) => {
      const child = new EventEmitter() as never as {
        stdout: EventEmitter; stderr: EventEmitter; kill: () => void
        on: EventEmitter['on']; emit: EventEmitter['emit']
      }
      const ee = child as unknown as EventEmitter
      ;(child as { stdout: EventEmitter }).stdout = new EventEmitter()
      ;(child as { stderr: EventEmitter }).stderr = new EventEmitter()
      ;(child as { kill: () => void }).kill = () => queueMicrotask(() => ee.emit('close', null))
      queueMicrotask(async () => {
        const dest = args[args.length - 1]
        for (const [rel, content] of Object.entries(files)) {
          const abs = join(dest, rel)
          await mkdir(join(abs, '..'), { recursive: true })
          await writeFile(abs, content)
        }
        ee.emit('close', 0)
      })
      return child as never
    }
    return fn as never
  }

  describe('buildGithubRef', () => {
    it('clones, discovers, parses, indexes, caches, and deletes the clone', async () => {
      const events: BuildProgress[] = []
      const spawnFn = repoSpawn({ 'README.md': '# Readme', 'docs/guide.md': '# Guide\nbody' })
      const res = await buildGithubRef(project(), 'main', (p) => events.push(p), new AbortController().signal, { spawnFn })
      expect(res.ref).toBe('main')
      expect(res.docCount).toBe(2)
      const stages = events.map((e) => e.stage)
      expect(stages).toContain('cloning')
      expect(stages).toContain('indexing')
      expect(stages[stages.length - 1]).toBe('done')
      const cache = await readCache('p1', 'main')
      expect(cache?.docs['docs/guide.md'].content).toContain('# Guide')
    })

    it('honors an explicit docsSubpath', async () => {
      const spawnFn = repoSpawn({ 'README.md': '# R', 'pkg/notes.md': '# Notes', 'docs/x.md': '# X' })
      const res = await buildGithubRef(project({ docsSubpath: 'pkg' }), 'main', () => {}, new AbortController().signal, { spawnFn })
      const cache = await readCache('p1', 'main')
      expect(Object.keys(cache!.docs)).toEqual(['pkg/notes.md'])
      expect(res.docCount).toBe(1)
    })

    it('cleans up the clone even on failure (no cache written)', async () => {
      const failSpawn = ((cmd: string, args: string[]) => {
        const child = new EventEmitter() as unknown as { stdout: EventEmitter; stderr: EventEmitter; kill: () => void }
        ;(child as { stdout: EventEmitter }).stdout = new EventEmitter()
        ;(child as { stderr: EventEmitter }).stderr = new EventEmitter()
        ;(child as { kill: () => void }).kill = () => {}
        queueMicrotask(() => {
          ;(child as unknown as EventEmitter).emit('close', 128)
        })
        return child as never
      }) as never
      await expect(buildGithubRef(project(), 'main', () => {}, new AbortController().signal, { spawnFn: failSpawn }))
        .rejects.toThrow()
      expect(await readCache('p1', 'main')).toBeNull()
    })

    it('is cancelable mid-build', async () => {
      const ac = new AbortController()
      const neverSpawn = ((cmd: string, args: string[]) => {
        const child = new EventEmitter() as unknown as { stdout: EventEmitter; stderr: EventEmitter; kill: () => void }
        ;(child as { stdout: EventEmitter }).stdout = new EventEmitter()
        ;(child as { stderr: EventEmitter }).stderr = new EventEmitter()
        ;(child as { kill: () => void }).kill = () => (child as unknown as EventEmitter).emit('close', null)
        return child as never
      }) as never
      const p = buildGithubRef(project(), 'main', () => {}, ac.signal, { spawnFn: neverSpawn })
      queueMicrotask(() => ac.abort())
      await expect(p).rejects.toThrow(/cancel/i)
    })
  })
  ```
- [ ] Run: `bun test tests/build.test.ts` — expect FAIL (`build.ts` missing).
- [ ] Implement `src/main/pipeline/build.ts`:
  ```ts
  import { spawn } from 'node:child_process'
  import { rm, readFile } from 'node:fs/promises'
  import type { GithubProject, ParsedDoc, DocKind, BuildProgress, BuildStage } from '@shared/types'
  import { cloneRepo, resolveDefaultRef, type SpawnFn } from './clone'
  import { discoverDetailed } from './discover'
  import { parseMarkdown, parseHtml } from './parse'
  import { buildIndex, serializeIndex } from './index'
  import { buildTree } from '../tree'
  import { safeResolve } from '../util/pathsafe'
  import { writeCache, CACHE_VERSION, type CacheData } from '../cache'

  export interface BuildDeps {
    spawnFn?: SpawnFn
  }
  export interface BuildResult {
    ref: string
    docCount: number
  }

  // Orchestrates a single github ref build: clone → discover → parse → index →
  // cache → delete clone. Emits progress; cancelable via the signal. The clone is
  // always removed in `finally`; the cache is written atomically by cache.writeCache
  // (so a failed/canceled build leaves any prior ref cache intact and writes none).
  export async function buildGithubRef(
    project: GithubProject,
    requestedRef: string,
    onProgress: (p: BuildProgress) => void,
    signal: AbortSignal,
    deps: BuildDeps = {}
  ): Promise<BuildResult> {
    const emit = (stage: BuildStage, extra: Partial<BuildProgress> = {}): void =>
      onProgress({ projectId: project.id, ref: requestedRef || 'HEAD', stage, ...extra })
    const throwIfAborted = (): void => {
      if (signal.aborted) throw new Error('Build canceled')
    }

    let cloneDir: string | null = null
    try {
      emit('cloning')
      cloneDir = await cloneRepo({
        source: project.source,
        ref: requestedRef || undefined,
        signal,
        spawnFn: deps.spawnFn
      })
      throwIfAborted()

      let ref = requestedRef
      if (!ref) {
        emit('resolving')
        ref = await resolveDefaultRef(cloneDir, deps.spawnFn ?? spawn)
      }

      emit('discovering')
      const { docs: discovered, skipped } = await discoverDetailed(cloneDir, {
        docsSubpath: project.docsSubpath
      })
      throwIfAborted()

      emit('parsing', { docCount: discovered.length, skipped: skipped.length })
      const parsed: ParsedDoc[] = []
      const docs: CacheData['docs'] = {}
      for (const d of discovered) {
        const abs = safeResolve(cloneDir, d.path)
        const raw = await readFile(abs, 'utf8')
        const kind: DocKind = d.kind
        if (kind === 'md') parsed.push(parseMarkdown(d.path, d.path.split('/').pop()!, raw))
        else parsed.push(parseHtml(d.path, d.path.split('/').pop()!))
        docs[d.path] = { kind, content: raw }
      }
      throwIfAborted()

      emit('indexing')
      const sections = parsed.flatMap((p) => p.sections)
      const index = buildIndex(sections)
      const tree = buildTree(parsed)

      emit('caching')
      const data: CacheData = {
        manifest: {
          cacheVersion: CACHE_VERSION,
          ref,
          builtAt: new Date().toISOString(),
          docCount: parsed.length,
          tree,
          sections
        },
        docs,
        indexJson: serializeIndex(index)
      }
      await writeCache(project.id, ref, data)

      emit('done', { docCount: parsed.length })
      return { ref, docCount: parsed.length }
    } finally {
      if (cloneDir) {
        emit('cleanup')
        await rm(cloneDir, { recursive: true, force: true })
      }
    }
  }
  ```
- [ ] Run: `bun test tests/build.test.ts` — expect PASS.
- [ ] Commit: `feat(build): cancelable github build orchestration with progress + cache`

## Task 8 — Registry: github add (dedup by identity), ref tracking, patch typing

**Files:** `src/main/registry.ts`, `tests/githubRegistry.test.ts`

- [ ] Write failing tests `tests/githubRegistry.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'bun:test'
  import { mkdtemp, rm } from 'node:fs/promises'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import { setBaseDir } from '../src/main/paths'
  import {
    addGithubProject, recordRef, setCurrentRef, removeRefRecord,
    listProjects, getProject, updateProject
  } from '../src/main/registry'
  import type { GithubProject } from '../src/shared/types'

  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dv-ghreg-'))
    setBaseDir(dir)
  })

  describe('github registry', () => {
    it('adds a github project with a normalized source + derived name', async () => {
      const { project, created } = await addGithubProject('octocat/Hello-World')
      expect(created).toBe(true)
      expect(project.type).toBe('github')
      expect(project.source).toBe('https://github.com/octocat/Hello-World')
      expect(project.name).toBe('octocat/Hello-World')
      expect(project.status).toBe('building')
      expect(project.refs).toEqual([])
      await rm(dir, { recursive: true, force: true })
    })

    it('dedupes by identity (source + docsSubpath), ref excluded', async () => {
      const a = await addGithubProject('octocat/Hello-World')
      const b = await addGithubProject('https://github.com/octocat/Hello-World.git')
      expect(b.created).toBe(false)
      expect(b.project.id).toBe(a.project.id)
      // A different docsSubpath is a distinct identity → distinct project.
      const c = await addGithubProject('octocat/Hello-World', { docsSubpath: 'docs' })
      expect(c.created).toBe(true)
      expect(c.project.id).not.toBe(a.project.id)
      expect(await listProjects()).toHaveLength(2)
      await rm(dir, { recursive: true, force: true })
    })

    it('records refs and defaults currentRef to the first built ref', async () => {
      const { project } = await addGithubProject('o/r')
      await recordRef(project.id, 'main', 5)
      let p = (await getProject(project.id)) as GithubProject
      expect(p.currentRef).toBe('main')
      expect(p.refs).toEqual([{ ref: 'main', lastBuiltAt: expect.any(String), docCount: 5 }])
      expect(p.status).toBe('ok')
      await recordRef(project.id, 'dev', 2)
      await recordRef(project.id, 'main', 6) // re-build updates in place
      p = (await getProject(project.id)) as GithubProject
      expect(p.refs).toHaveLength(2)
      expect(p.refs.find((r) => r.ref === 'main')!.docCount).toBe(6)
      await rm(dir, { recursive: true, force: true })
    })

    it('switches and removes refs, repointing currentRef when needed', async () => {
      const { project } = await addGithubProject('o/r')
      await recordRef(project.id, 'main', 1)
      await recordRef(project.id, 'dev', 1)
      await setCurrentRef(project.id, 'dev')
      await removeRefRecord(project.id, 'dev')
      const p = (await getProject(project.id)) as GithubProject
      expect(p.refs.map((r) => r.ref)).toEqual(['main'])
      expect(p.currentRef).toBe('main') // repointed away from the removed ref
      await rm(dir, { recursive: true, force: true })
    })

    it('updateProject patches a github field without losing the discriminant', async () => {
      const { project } = await addGithubProject('o/r')
      const updated = await updateProject(project.id, { name: 'Renamed' })
      expect(updated.name).toBe('Renamed')
      expect(updated.type).toBe('github')
      await rm(dir, { recursive: true, force: true })
    })
  })
  ```
- [ ] Run: `bun test tests/githubRegistry.test.ts` — expect FAIL.
- [ ] Implement in `src/main/registry.ts`. Update imports, fix `updateProject` typing for the union, and add the github functions. Replace the import line and `updateProject`, then append the new functions:
  - Imports (replace the top imports block):
    ```ts
    import { readFile, writeFile, mkdir } from 'node:fs/promises'
    import { basename } from 'node:path'
    import { randomUUID } from 'node:crypto'
    import type { Project, GithubProject, ProjectPatch } from '@shared/types'
    import { projectsFile, userDataDir } from './paths'
    import { parseGithubSource, defaultGithubName, githubIdentity } from './util/github'
    ```
  - Replace `updateProject`'s signature/body to accept the union patch:
    ```ts
    export async function updateProject(id: string, patch: ProjectPatch): Promise<Project> {
      const projects = await readAll()
      const idx = projects.findIndex((p) => p.id === id)
      if (idx < 0) throw new Error(`Project not found: ${id}`)
      projects[idx] = { ...projects[idx], ...patch, id: projects[idx].id, type: projects[idx].type } as Project
      await writeAll(projects)
      return projects[idx]
    }
    ```
  - Append the github functions at the end of the file:
    ```ts
    export async function addGithubProject(
      input: string,
      opts: { name?: string; docsSubpath?: string } = {}
    ): Promise<{ project: GithubProject; created: boolean }> {
      const src = parseGithubSource(input)
      const docsSubpath = opts.docsSubpath?.trim() || undefined
      const projects = await readAll()
      const identity = githubIdentity(src.url, docsSubpath)
      const existing = projects.find(
        (p): p is GithubProject =>
          p.type === 'github' && githubIdentity(p.source, p.docsSubpath) === identity
      )
      if (existing) return { project: existing, created: false }

      const project: GithubProject = {
        id: randomUUID(),
        name: opts.name?.trim() || defaultGithubName(src, docsSubpath),
        type: 'github',
        source: src.url,
        docsSubpath,
        refs: [],
        currentRef: '',
        addedAt: new Date().toISOString(),
        status: 'building'
      }
      projects.push(project)
      await writeAll(projects)
      return { project, created: true }
    }

    function requireGithub(projects: Project[], id: string): GithubProject {
      const p = projects.find((x) => x.id === id)
      if (!p) throw new Error(`Project not found: ${id}`)
      if (p.type !== 'github') throw new Error(`Not a github project: ${id}`)
      return p
    }

    export async function recordRef(id: string, ref: string, docCount: number): Promise<GithubProject> {
      const projects = await readAll()
      const p = requireGithub(projects, id)
      const now = new Date().toISOString()
      const existing = p.refs.find((r) => r.ref === ref)
      if (existing) {
        existing.lastBuiltAt = now
        existing.docCount = docCount
      } else {
        p.refs.push({ ref, lastBuiltAt: now, docCount })
      }
      if (!p.currentRef) p.currentRef = ref
      p.status = 'ok'
      await writeAll(projects)
      return p
    }

    export async function setCurrentRef(id: string, ref: string): Promise<GithubProject> {
      const projects = await readAll()
      const p = requireGithub(projects, id)
      p.currentRef = ref
      await writeAll(projects)
      return p
    }

    export async function removeRefRecord(id: string, ref: string): Promise<GithubProject> {
      const projects = await readAll()
      const p = requireGithub(projects, id)
      p.refs = p.refs.filter((r) => r.ref !== ref)
      if (p.currentRef === ref) p.currentRef = p.refs[0]?.ref ?? ''
      await writeAll(projects)
      return p
    }
    ```
- [ ] Run: `bun test tests/githubRegistry.test.ts` — expect PASS. Also run `bun test tests/registry.test.ts` — expect PASS (local registry untouched).
- [ ] Commit: `feat(registry): github project add with identity dedup and ref tracking`

## Task 9 — projectService: type-branched read path, ref switching, rebuild, cancel

**Files:** `src/main/projectService.ts`, `tests/githubProjectService.test.ts`

- [ ] Write failing tests `tests/githubProjectService.test.ts`. These drive a github project through a fake spawn (same `repoSpawn` helper as the build test), then exercise the cached read path and ref switching:
  ```ts
  import { describe, it, expect, beforeEach } from 'bun:test'
  import { EventEmitter } from 'node:events'
  import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import { setBaseDir } from '../src/main/paths'
  import {
    addGithubProject, selectProject, getDoc, search, switchRef, listRefs
  } from '../src/main/projectService'
  import type { GithubProject } from '../src/shared/types'

  let base: string
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'dv-ghsvc-'))
    setBaseDir(base)
  })

  function repoSpawn(files: Record<string, string>) {
    return ((cmd: string, args: string[]) => {
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

  describe('github projectService', () => {
    it('adds + builds, then selects from cache and reads a cached doc', async () => {
      const spawnFn = repoSpawn({ 'docs/guide.md': '# Guide\nhello setup world' })
      const p = await addGithubProject('o/r', { ref: 'main' }, () => {}, { spawnFn })
      expect((p as GithubProject).currentRef).toBe('main')

      const { tree, docCount } = await selectProject(p.id)
      expect(docCount).toBe(1)
      expect(tree.some((n) => n.type === 'folder' && n.name === 'docs')).toBe(true)

      const doc = await getDoc(p.id, 'docs/guide.md')
      expect(doc.kind).toBe('md')
      expect(doc.content).toContain('# Guide')

      const results = await search(p.id, 'setup')
      expect(results.some((r) => r.docPath === 'docs/guide.md')).toBe(true)
    })

    it('rejects a getDoc for a path not in the cache', async () => {
      const spawnFn = repoSpawn({ 'a.md': '# A' })
      const p = await addGithubProject('o/r', { ref: 'main' }, () => {}, { spawnFn })
      await selectProject(p.id)
      await expect(getDoc(p.id, 'secret.md')).rejects.toThrow(/not in cache/i)
    })

    it('switches to a new ref (builds it) and lists refs', async () => {
      const spawnFn = repoSpawn({ 'a.md': '# A' })
      const p = await addGithubProject('o/r', { ref: 'main' }, () => {}, { spawnFn })
      await selectProject(p.id)
      const { docCount } = await switchRef(p.id, 'dev', () => {}, { spawnFn })
      expect(docCount).toBe(1)
      const refs = await listRefs(p.id)
      expect(refs.map((r) => r.ref).sort()).toEqual(['dev', 'main'])
    })
  })
  ```
- [ ] Run: `bun test tests/githubProjectService.test.ts` — expect FAIL.
- [ ] Implement in `src/main/projectService.ts`. The full target file (incorporates the Task 7 `buildTree` extraction):
  ```ts
  import { readFile } from 'node:fs/promises'
  import type { spawn } from 'node:child_process'
  import type MiniSearch from 'minisearch'
  import type {
    NavNode, ParsedDoc, SearchResult, DocKind, Project, GithubProject, BuildProgress
  } from '@shared/types'
  import {
    getProject, updateProject, removeProject as registryRemoveProject,
    addGithubProject as registryAddGithub, recordRef, setCurrentRef, removeRefRecord
  } from './registry'
  import { discover } from './pipeline/discover'
  import { parseMarkdown, parseHtml } from './pipeline/parse'
  import { buildIndex, loadIndex, runSearch } from './pipeline/index'
  import { buildGithubRef } from './pipeline/build'
  import { buildTree } from './tree'
  import { readCache, hasCache, purgeProjectCache, removeRefCache } from './cache'
  import { safeResolve } from './util/pathsafe'

  interface ActiveProject {
    id: string
    type: 'local' | 'github'
    root: string // local: source dir; github: '' (served from cache)
    docs: Map<string, ParsedDoc>
    index: MiniSearch
    tree: NavNode[]
    contents?: Map<string, { kind: DocKind; content: string }> // github only
  }

  let active: ActiveProject | null = null

  // In-flight builds, keyed by project id, so cancelBuild can abort them.
  const inFlight = new Map<string, AbortController>()
  type BuildDeps = { spawnFn?: typeof spawn }
  const noProgress = (): void => {}

  export function cancelBuild(id: string): void {
    inFlight.get(id)?.abort()
  }

  // ── local select (live, in-memory) ──────────────────────────────────────────
  async function selectLocal(project: Project & { type: 'local' }): Promise<{ tree: NavNode[]; docCount: number }> {
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
    active = { id: project.id, type: 'local', root, docs: new Map(docs.map((d) => [d.path, d])), index, tree }
    await updateProject(project.id, {
      docCount: docs.length,
      lastBuiltAt: new Date().toISOString(),
      status: 'ok'
    })
    return { tree, docCount: docs.length }
  }

  // ── github load (from cache; build if missing/stale) ────────────────────────
  async function loadGithubRef(
    project: GithubProject,
    ref: string,
    onProgress: (p: BuildProgress) => void,
    deps: BuildDeps
  ): Promise<{ tree: NavNode[]; docCount: number }> {
    let cache = await readCache(project.id, ref)
    if (!cache) {
      // Missing or stale (cacheVersion mismatch) → rebuild this ref.
      const controller = new AbortController()
      inFlight.set(project.id, controller)
      try {
        const { docCount } = await buildGithubRef(project, ref, onProgress, controller.signal, deps)
        await recordRef(project.id, ref, docCount)
      } finally {
        inFlight.delete(project.id)
      }
      cache = await readCache(project.id, ref)
      if (!cache) throw new Error(`Cache unavailable after build: ${project.id}@${ref}`)
    }
    const sections = cache.manifest.sections
    const index = loadIndex(cache.indexJson, sections)
    active = {
      id: project.id,
      type: 'github',
      root: '',
      docs: new Map(),
      index,
      tree: cache.manifest.tree,
      contents: new Map(Object.entries(cache.docs))
    }
    return { tree: cache.manifest.tree, docCount: cache.manifest.docCount }
  }

  export async function selectProject(id: string): Promise<{ tree: NavNode[]; docCount: number }> {
    const project = await getProject(id)
    if (!project) throw new Error(`Project not found: ${id}`)
    active = null // tear down previous (active-Project lifecycle)
    if (project.type === 'github') return loadGithubRef(project, project.currentRef, noProgress, {})
    return selectLocal(project)
  }

  // ── add github (build first ref) ────────────────────────────────────────────
  export async function addGithubProject(
    input: string,
    opts: { name?: string; ref?: string; docsSubpath?: string } = {},
    onProgress: (p: BuildProgress) => void = noProgress,
    deps: BuildDeps = {}
  ): Promise<Project> {
    const { project, created } = await registryAddGithub(input, { name: opts.name, docsSubpath: opts.docsSubpath })
    if (!created) return project // re-add of existing identity → caller switches to it

    const controller = new AbortController()
    inFlight.set(project.id, controller)
    try {
      const { ref, docCount } = await buildGithubRef(project, opts.ref?.trim() || '', onProgress, controller.signal, deps)
      return await recordRef(project.id, ref, docCount)
    } catch (err) {
      // A failed/canceled add leaves NO registry entry and no cache (ADR/spec).
      await registryRemoveProject(project.id)
      await purgeProjectCache(project.id)
      throw err
    } finally {
      inFlight.delete(project.id)
    }
  }

  // ── ref management (github) ─────────────────────────────────────────────────
  export async function listRefs(id: string): Promise<GithubProject['refs']> {
    const p = await getProject(id)
    if (!p || p.type !== 'github') throw new Error(`Not a github project: ${id}`)
    return p.refs
  }

  export async function switchRef(
    id: string,
    ref: string,
    onProgress: (p: BuildProgress) => void = noProgress,
    deps: BuildDeps = {}
  ): Promise<{ tree: NavNode[]; docCount: number }> {
    const project = await getProject(id)
    if (!project || project.type !== 'github') throw new Error(`Not a github project: ${id}`)
    if (!(await hasCache(id, ref))) {
      const controller = new AbortController()
      inFlight.set(id, controller)
      try {
        const { docCount } = await buildGithubRef(project, ref, onProgress, controller.signal, deps)
        await recordRef(id, ref, docCount)
      } finally {
        inFlight.delete(id)
      }
    }
    await setCurrentRef(id, ref)
    const updated = (await getProject(id)) as GithubProject
    return loadGithubRef(updated, ref, onProgress, deps)
  }

  // Adding a ref is switching to it (builds if uncached).
  export const addRef = switchRef

  export async function removeRef(id: string, ref: string): Promise<void> {
    await removeRefRecord(id, ref)
    await removeRefCache(id, ref)
  }

  // ── rebuild ("Pull latest" github / "Reindex" local) ────────────────────────
  export async function rebuildProject(
    id: string,
    onProgress: (p: BuildProgress) => void = noProgress,
    deps: BuildDeps = {}
  ): Promise<void> {
    const project = await getProject(id)
    if (!project) throw new Error(`Project not found: ${id}`)
    if (project.type === 'local') {
      await selectLocal(project) // Reindex: re-walk live content
      return
    }
    const controller = new AbortController()
    inFlight.set(id, controller)
    try {
      const { ref, docCount } = await buildGithubRef(project, project.currentRef, onProgress, controller.signal, deps)
      await recordRef(id, ref, docCount)
      if (active?.id === id) await loadGithubRef(project, ref, onProgress, deps)
    } finally {
      inFlight.delete(id)
    }
  }

  // ── reads (type-branched) ───────────────────────────────────────────────────
  function requireActive(id: string): ActiveProject {
    if (!active || active.id !== id) throw new Error(`Project not active: ${id}`)
    return active
  }

  export async function getDoc(id: string, relativePath: string): Promise<{ kind: DocKind; content: string }> {
    const a = requireActive(id)
    if (a.type === 'github') {
      // Served from the cache map; key membership is the guard (no fs path is built
      // from untrusted input).
      const entry = a.contents?.get(relativePath)
      if (!entry) throw new Error(`Document not in cache: ${relativePath}`)
      return entry
    }
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
- [ ] Run: `bun test tests/githubProjectService.test.ts` — expect PASS. Also run `bun test tests/projectService.test.ts` — expect PASS (local path preserved).
- [ ] Run: `bun run typecheck` — expect PASS now (all main-process types reconciled).
- [ ] Commit: `feat(projectService): type-branched read path, github ref switching, rebuild`

## Task 10 — IPC + preload: wire handlers and streamed `onBuildProgress`

**Files:** `src/main/ipc.ts`, `src/preload/index.ts`, `src/main/index.ts`

- [ ] Update `src/main/ipc.ts`. Each build-triggering handler forwards progress to the calling renderer via `e.sender.send('build:progress', p)`. Replace the file:
  ```ts
  import { ipcMain, dialog } from 'electron'
  import type { IpcMainInvokeEvent } from 'electron'
  import type { BuildProgress } from '@shared/types'
  import { listProjects, addLocalProject, removeProject, updateProject } from './registry'
  import {
    selectProject, getDoc, search,
    addGithubProject, rebuildProject, cancelBuild,
    listRefs, switchRef, addRef, removeRef
  } from './projectService'
  import { purgeProjectCache } from './cache'

  export function registerIpc(): void {
    const progressTo = (e: IpcMainInvokeEvent) => (p: BuildProgress): void => {
      if (!e.sender.isDestroyed()) e.sender.send('build:progress', p)
    }

    ipcMain.handle('projects:list', () => listProjects())
    ipcMain.handle('projects:addLocal', (_e, source: string, name?: string) =>
      addLocalProject(source, name)
    )
    ipcMain.handle(
      'projects:addGithub',
      (e, source: string, opts?: { name?: string; ref?: string; docsSubpath?: string }) =>
        addGithubProject(source, opts ?? {}, progressTo(e))
    )
    ipcMain.handle('projects:remove', async (_e, id: string) => {
      await purgeProjectCache(id) // remove derived cache (no-op for local)
      await removeProject(id)
    })
    ipcMain.handle(
      'projects:updateSettings',
      (_e, id: string, patch: { name?: string; docsSubpath?: string; themeId?: string }) =>
        updateProject(id, patch)
    )
    ipcMain.handle('projects:rebuild', (e, id: string) => rebuildProject(id, progressTo(e)))
    ipcMain.handle('projects:cancelBuild', (_e, id: string) => cancelBuild(id))
    ipcMain.handle('projects:listRefs', (_e, id: string) => listRefs(id))
    ipcMain.handle('projects:switchRef', (e, id: string, ref: string) =>
      switchRef(id, ref, progressTo(e))
    )
    ipcMain.handle('projects:addRef', (e, id: string, ref: string) =>
      addRef(id, ref, progressTo(e))
    )
    ipcMain.handle('projects:removeRef', (_e, id: string, ref: string) => removeRef(id, ref))
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
- [ ] Update `src/preload/index.ts` to expose the full `IpcApi` including the `onBuildProgress` subscription (returns an unsubscribe):
  ```ts
  import { contextBridge, ipcRenderer } from 'electron'
  import type { IpcApi, BuildProgress } from '../shared/types'

  const api: IpcApi = {
    listProjects: () => ipcRenderer.invoke('projects:list'),
    addLocalProject: (source, name) => ipcRenderer.invoke('projects:addLocal', source, name),
    addGithubProject: (source, opts) => ipcRenderer.invoke('projects:addGithub', source, opts),
    removeProject: (id) => ipcRenderer.invoke('projects:remove', id),
    updateProjectSettings: (id, patch) => ipcRenderer.invoke('projects:updateSettings', id, patch),
    rebuildProject: (id) => ipcRenderer.invoke('projects:rebuild', id),
    cancelBuild: (id) => ipcRenderer.invoke('projects:cancelBuild', id),
    listRefs: (id) => ipcRenderer.invoke('projects:listRefs', id),
    switchRef: (id, ref) => ipcRenderer.invoke('projects:switchRef', id, ref),
    addRef: (id, ref) => ipcRenderer.invoke('projects:addRef', id, ref),
    removeRef: (id, ref) => ipcRenderer.invoke('projects:removeRef', id, ref),
    selectProject: (id) => ipcRenderer.invoke('projects:select', id),
    getDoc: (id, relativePath) => ipcRenderer.invoke('projects:getDoc', id, relativePath),
    search: (id, query) => ipcRenderer.invoke('projects:search', id, query),
    pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
    onBuildProgress: (cb) => {
      const handler = (_e: unknown, p: BuildProgress): void => cb(p)
      ipcRenderer.on('build:progress', handler)
      return () => ipcRenderer.removeListener('build:progress', handler)
    }
  }

  contextBridge.exposeInMainWorld('api', api)
  ```
- [ ] Add cache sweep on launch. In `src/main/index.ts`, import and call `sweepOrphans` inside `app.whenReady()` before `registerIpc()`:
  ```ts
  import { sweepOrphans } from './cache'
  // ...
  app.whenReady().then(async () => {
    await sweepOrphans()
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  ```
- [ ] Run: `bun run typecheck` — expect PASS. Run `bunx electron-vite build` — expect a clean build (main/preload/renderer compile). Run the full suite `bun test` — expect PASS.
- [ ] Commit: `feat(ipc): wire github handlers, build-progress streaming, and cache sweep`

---

# Plan 2b — Renderer (GitHub UI)

> 2b is purely additive UI over the 2a backend. Renderer logic that isn't DOM-heavy stays in `App.tsx`; new presentational pieces are small components. Styling reuses existing design-system tokens (`--accent`, `--surface`, `--border`, `--radius-*`) and the existing `.modal`/`.modal-overlay` classes from the Settings modal.

## Task 11 — Add-Project modal: Local | GitHub with live progress + Cancel

**Files:** `src/renderer/src/components/AddProjectModal.tsx`, `src/renderer/src/styles.css`

- [ ] Write a failing test `tests/addProjectModal.test.ts` (jsdom + React Testing-style via `react-dom/client`; the repo already runs DOM tests under the `bunfig.toml` jsdom preload). Mock `window.api`:
  ```ts
  import { describe, it, expect, beforeEach } from 'bun:test'
  import { act } from 'react'
  import { createRoot, type Root } from 'react-dom/client'
  import AddProjectModal from '../src/renderer/src/components/AddProjectModal'
  import type { Project } from '../src/shared/types'

  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  function stubApi(over: Partial<Window['api']> = {}): void {
    ;(window as unknown as { api: Partial<Window['api']> }).api = {
      pickDirectory: async () => '/tmp/dir',
      addLocalProject: async () => ({ id: 'l1' }) as Project,
      addGithubProject: async () => ({ id: 'g1' }) as Project,
      cancelBuild: async () => {},
      onBuildProgress: () => () => {},
      ...over
    }
  }

  describe('AddProjectModal', () => {
    it('defaults to the GitHub tab input and validates empty source', async () => {
      stubApi()
      let added: Project | null = null
      await act(async () => {
        root.render(
          AddProjectModal({ onAdded: (p) => { added = p }, onClose: () => {} }) as never
        )
      })
      const ghTab = container.querySelector('[data-tab="github"]') as HTMLButtonElement
      expect(ghTab).toBeTruthy()
      const submit = container.querySelector('[data-action="submit-github"]') as HTMLButtonElement
      await act(async () => { submit.click() })
      // No source typed → addGithubProject not called, project not added.
      expect(added).toBeNull()
    })

    it('adds a github project with the typed source', async () => {
      let calledWith = ''
      stubApi({
        addGithubProject: async (source: string) => { calledWith = source; return { id: 'g1' } as Project }
      })
      let added: Project | null = null
      await act(async () => {
        root.render(AddProjectModal({ onAdded: (p) => { added = p }, onClose: () => {} }) as never)
      })
      const input = container.querySelector('[data-field="source"]') as HTMLInputElement
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
        setter.call(input, 'octocat/Hello-World')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      const submit = container.querySelector('[data-action="submit-github"]') as HTMLButtonElement
      await act(async () => { submit.click() })
      expect(calledWith).toBe('octocat/Hello-World')
      expect((added as Project | null)?.id).toBe('g1')
    })
  })
  ```
  > Note: this RTL-lite pattern mirrors the existing `tests/render.test.ts` DOM approach. If the existing renderer tests use a different harness, match that harness; the assertions (default GitHub tab, empty-source guard, source forwarded to `addGithubProject`) are the contract.
- [ ] Run: `bun test tests/addProjectModal.test.ts` — expect FAIL (component missing).
- [ ] Implement `src/renderer/src/components/AddProjectModal.tsx`:
  ```tsx
  import { useEffect, useRef, useState } from 'react'
  import type { Project, BuildProgress } from '@shared/types'

  type Tab = 'local' | 'github'

  interface Props {
    onAdded: (project: Project) => void
    onClose: () => void
  }

  const STAGE_LABEL: Record<BuildProgress['stage'], string> = {
    cloning: 'Cloning…',
    resolving: 'Resolving default branch…',
    discovering: 'Discovering docs…',
    parsing: 'Parsing…',
    indexing: 'Indexing…',
    caching: 'Caching…',
    cleanup: 'Cleaning up…',
    done: 'Done',
    error: 'Error'
  }

  export default function AddProjectModal({ onAdded, onClose }: Props): React.JSX.Element {
    const [tab, setTab] = useState<Tab>('github')
    const [source, setSource] = useState('')
    const [ref, setRef] = useState('')
    const [docsSubpath, setDocsSubpath] = useState('')
    const [busy, setBusy] = useState(false)
    const [progress, setProgress] = useState<BuildProgress | null>(null)
    const [error, setError] = useState<string | null>(null)
    const addedIdRef = useRef<string | null>(null)

    // Subscribe to streamed build progress while a github build runs.
    useEffect(() => {
      const unsub = window.api.onBuildProgress((p) => setProgress(p))
      return unsub
    }, [])

    const addLocal = async (): Promise<void> => {
      setError(null)
      const dir = await window.api.pickDirectory()
      if (!dir) return
      setBusy(true)
      try {
        const p = await window.api.addLocalProject(dir)
        onAdded(p)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setBusy(false)
      }
    }

    const addGithub = async (): Promise<void> => {
      const src = source.trim()
      if (!src) {
        setError('Enter a GitHub URL or owner/repo.')
        return
      }
      setError(null)
      setBusy(true)
      setProgress(null)
      try {
        const p = await window.api.addGithubProject(src, {
          ref: ref.trim() || undefined,
          docsSubpath: docsSubpath.trim() || undefined
        })
        addedIdRef.current = p.id
        onAdded(p)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setBusy(false)
      }
    }

    const cancel = (): void => {
      if (addedIdRef.current) void window.api.cancelBuild(addedIdRef.current)
      onClose()
    }

    return (
      <div className="modal-overlay" onClick={busy ? undefined : onClose}>
        <div className="modal add-modal" onClick={(e) => e.stopPropagation()}>
          <header>
            <h2>Add project</h2>
            <button className="icon-button" aria-label="Close" onClick={onClose} disabled={busy}>
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </header>

          <div className="add-tabs" role="tablist">
            <button
              role="tab"
              data-tab="github"
              aria-selected={tab === 'github'}
              className={`add-tab${tab === 'github' ? ' active' : ''}`}
              onClick={() => setTab('github')}
              disabled={busy}
            >
              GitHub
            </button>
            <button
              role="tab"
              data-tab="local"
              aria-selected={tab === 'local'}
              className={`add-tab${tab === 'local' ? ' active' : ''}`}
              onClick={() => setTab('local')}
              disabled={busy}
            >
              Local Directory
            </button>
          </div>

          {tab === 'github' ? (
            <div className="add-body">
              <label className="field">
                <span>Repository</span>
                <input
                  data-field="source"
                  placeholder="owner/repo or https://github.com/owner/repo"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span>Branch / ref (optional)</span>
                <input
                  data-field="ref"
                  placeholder="default branch"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span>Docs subpath (optional)</span>
                <input
                  data-field="docsSubpath"
                  placeholder="e.g. docs"
                  value={docsSubpath}
                  onChange={(e) => setDocsSubpath(e.target.value)}
                  disabled={busy}
                />
              </label>
              {busy && progress && (
                <div className="add-progress" role="status">
                  <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                  <span>{STAGE_LABEL[progress.stage]}</span>
                  {typeof progress.docCount === 'number' && <span> · {progress.docCount} docs</span>}
                </div>
              )}
              {error && <p className="add-error">{error}</p>}
              <div className="add-actions">
                {busy ? (
                  <button className="topbar-button" onClick={cancel}>Cancel</button>
                ) : (
                  <button className="topbar-button active" data-action="submit-github" onClick={addGithub}>
                    Add
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="add-body">
              <p className="add-hint">Choose a local directory to index live.</p>
              {error && <p className="add-error">{error}</p>}
              <div className="add-actions">
                <button className="topbar-button active" data-action="pick-local" onClick={addLocal} disabled={busy}>
                  Choose directory…
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
  ```
- [ ] Add styles to `src/renderer/src/styles.css` (append): `.add-modal`, `.add-tabs`/`.add-tab`, `.field`, `.add-progress`, `.add-error`, `.add-actions`, `.add-hint` using existing tokens. Example block:
  ```css
  .add-modal { width: 460px; }
  .add-tabs { display: flex; gap: var(--space-2); padding: 0 var(--space-4) var(--space-3); }
  .add-tab { padding: 6px 12px; border-radius: var(--radius-sm); background: var(--surface-alt); color: var(--muted); border: 1px solid var(--border); }
  .add-tab.active { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
  .add-body { display: flex; flex-direction: column; gap: var(--space-3); padding: 0 var(--space-4) var(--space-4); }
  .field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .field span { color: var(--muted); }
  .field input { padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); color: var(--fg); }
  .add-progress { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
  .add-error { color: var(--danger, #e5484d); font-size: 13px; }
  .add-actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
  .add-hint { color: var(--muted); font-size: 13px; }
  ```
- [ ] Run: `bun test tests/addProjectModal.test.ts` — expect PASS. Run `bun run typecheck` — expect PASS.
- [ ] Commit: `feat(ui): add-project modal with github option, live progress, and cancel`

## Task 12 — Branch switcher (github)

**Files:** `src/renderer/src/components/BranchSwitcher.tsx`, `src/renderer/src/styles.css`

- [ ] Write a failing test `tests/branchSwitcher.test.ts` (jsdom). Render with two refs; assert the current ref is shown and that selecting another calls `onSwitch`:
  ```ts
  import { describe, it, expect, beforeEach } from 'bun:test'
  import { act } from 'react'
  import { createRoot, type Root } from 'react-dom/client'
  import BranchSwitcher from '../src/renderer/src/components/BranchSwitcher'
  import type { RefInfo } from '../src/shared/types'

  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  const refs: RefInfo[] = [
    { ref: 'main', lastBuiltAt: 'now', docCount: 3 },
    { ref: 'dev', lastBuiltAt: 'now', docCount: 1 }
  ]

  describe('BranchSwitcher', () => {
    it('shows the current ref and switches on change', async () => {
      let switched = ''
      await act(async () => {
        root.render(
          BranchSwitcher({ refs, currentRef: 'main', onSwitch: (r) => { switched = r }, onAddRef: () => {}, onRemoveRef: () => {} }) as never
        )
      })
      const select = container.querySelector('[data-role="ref-select"]') as HTMLSelectElement
      expect(select.value).toBe('main')
      await act(async () => {
        select.value = 'dev'
        select.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(switched).toBe('dev')
    })
  })
  ```
- [ ] Run: `bun test tests/branchSwitcher.test.ts` — expect FAIL.
- [ ] Implement `src/renderer/src/components/BranchSwitcher.tsx`:
  ```tsx
  import { useState } from 'react'
  import type { RefInfo } from '@shared/types'

  interface Props {
    refs: RefInfo[]
    currentRef: string
    onSwitch: (ref: string) => void
    onAddRef: (ref: string) => void
    onRemoveRef: (ref: string) => void
  }

  export default function BranchSwitcher(props: Props): React.JSX.Element {
    const { refs, currentRef } = props
    const [adding, setAdding] = useState(false)
    const [newRef, setNewRef] = useState('')

    const submitNew = (): void => {
      const r = newRef.trim()
      if (!r) return
      props.onAddRef(r)
      setNewRef('')
      setAdding(false)
    }

    return (
      <div className="branch-switcher">
        <i className="fa-solid fa-code-branch" aria-hidden="true" />
        <select
          data-role="ref-select"
          className="topbar-select"
          value={currentRef}
          aria-label="Branch"
          onChange={(e) => props.onSwitch(e.target.value)}
        >
          {refs.map((r) => (
            <option key={r.ref} value={r.ref}>{r.ref}</option>
          ))}
        </select>
        {adding ? (
          <input
            className="branch-input"
            autoFocus
            placeholder="branch / tag"
            value={newRef}
            onChange={(e) => setNewRef(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew()
              if (e.key === 'Escape') setAdding(false)
            }}
            onBlur={() => setAdding(false)}
          />
        ) : (
          <button className="icon-button" title="Add branch" aria-label="Add branch" onClick={() => setAdding(true)}>
            <i className="fa-solid fa-plus" aria-hidden="true" />
          </button>
        )}
        {refs.length > 1 && (
          <button
            className="icon-button"
            title={`Remove ${currentRef} cache`}
            aria-label={`Remove ${currentRef} cache`}
            onClick={() => props.onRemoveRef(currentRef)}
          >
            <i className="fa-solid fa-trash" aria-hidden="true" />
          </button>
        )}
      </div>
    )
  }
  ```
- [ ] Add styles to `styles.css` (append): `.branch-switcher { display: flex; align-items: center; gap: 6px; color: var(--muted); } .branch-input { padding: 6px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); color: var(--fg); width: 120px; }`
- [ ] Run: `bun test tests/branchSwitcher.test.ts` — expect PASS. Run `bun run typecheck` — expect PASS.
- [ ] Commit: `feat(ui): github branch switcher (switch/add/remove ref)`

## Task 13 — Wire modal, branch switcher, and per-type Rebuild into TopBar + App

**Files:** `src/renderer/src/components/TopBar.tsx`, `src/renderer/src/App.tsx`

- [ ] Update `TopBar.tsx` props and render. Add `onOpenAdd` (replaces the direct add), an optional `branchSwitcher` slot (rendered when present), and a `rebuild` control with a per-type label. Add to `Props`:
  ```ts
  activeProject: Project | null
  onOpenAdd: () => void
  onRebuild: () => void
  branchSwitcher?: React.ReactNode
  ```
  Replace the add button's `onClick={props.onAddProject}` with `onClick={props.onOpenAdd}` and its title/aria with `"Add project"`. After the breadcrumb, render the switcher and rebuild control:
  ```tsx
  {props.branchSwitcher}
  {props.activeProject && (
    <button
      className="icon-button"
      onClick={props.onRebuild}
      title={props.activeProject.type === 'github' ? 'Pull latest' : 'Reindex'}
      aria-label={props.activeProject.type === 'github' ? 'Pull latest' : 'Reindex'}
    >
      <i className="fa-solid fa-rotate" aria-hidden="true" />
    </button>
  )}
  ```
  Remove the now-unused `onAddProject` prop (or keep it typed if other callers need it — App will pass `onOpenAdd`). Add `import type { Project } from '@shared/types'`.
- [ ] Update `App.tsx`:
  - Add state: `const [addOpen, setAddOpen] = useState(false)` and derive `const activeProject = projects.find((p) => p.id === activeId) ?? null`.
  - Replace the existing `addProject` callback (which called `pickDirectory` + `addLocalProject` directly) with modal-driven handlers:
    ```tsx
    const onAdded = useCallback(async (p: Project) => {
      setAddOpen(false)
      await refreshProjects()
      await selectProject(p.id)
    }, [refreshProjects, selectProject])

    const rebuild = useCallback(async () => {
      if (!activeId) return
      await window.api.rebuildProject(activeId)
      await refreshProjects()
      const { tree } = await window.api.selectProject(activeId)
      setTree(tree)
    }, [activeId, refreshProjects])

    const switchRef = useCallback(async (ref: string) => {
      if (!activeId) return
      const { tree } = await window.api.switchRef(activeId, ref)
      setTree(tree)
      setDocPath(null)
      setToc([])
      await refreshProjects()
    }, [activeId, refreshProjects])

    const addRef = useCallback(async (ref: string) => {
      if (!activeId) return
      const { tree } = await window.api.addRef(activeId, ref)
      setTree(tree)
      await refreshProjects()
    }, [activeId, refreshProjects])

    const removeRef = useCallback(async (ref: string) => {
      if (!activeId) return
      await window.api.removeRef(activeId, ref)
      await refreshProjects()
    }, [activeId, refreshProjects])
    ```
  - In the `<TopBar />` usage, pass `activeProject={activeProject}`, `onOpenAdd={() => setAddOpen(true)}`, `onRebuild={rebuild}`, and the branch switcher slot:
    ```tsx
    branchSwitcher={
      activeProject?.type === 'github' ? (
        <BranchSwitcher
          refs={activeProject.refs}
          currentRef={activeProject.currentRef}
          onSwitch={switchRef}
          onAddRef={addRef}
          onRemoveRef={removeRef}
        />
      ) : undefined
    }
    ```
  - Render the modal near `<Settings>`:
    ```tsx
    {addOpen && <AddProjectModal onAdded={onAdded} onClose={() => setAddOpen(false)} />}
    ```
  - Add imports: `import AddProjectModal from './components/AddProjectModal'` and `import BranchSwitcher from './components/BranchSwitcher'`.
- [ ] Run: `bun run typecheck` — expect PASS. Run `bunx electron-vite build` — expect clean. Run `bun test` — expect PASS (full suite).
- [ ] Manual smoke (document in commit body, not automated here): launch `bun run dev`; Add a public github repo (e.g. `octocat/Hello-World`), watch progress, view a doc, switch refs, Pull latest. Add a local dir still works (Reindex label).
- [ ] Commit: `feat(ui): wire add-modal, branch switcher, and per-type rebuild into the shell`

## Task 14 — Adversarial / integration sweep

**Files:** `tests/build.test.ts`, `tests/githubProjectService.test.ts` (append cases)

- [ ] Add adversarial cases (append to existing files), then run each to confirm green:
  - **Empty repo** (no docs): `repoSpawn({})` → build succeeds with `docCount: 0`, cache present, `selectProject` returns an empty tree. (build.test.ts + githubProjectService.test.ts)
  - **docsSubpath override hides root README**: covered in build.test.ts Task 7 — assert additionally that `selectProject` after such a build cannot `getDoc('README.md')` (rejects "not in cache").
  - **Re-add identical identity** returns the existing project without a second build: in githubProjectService.test.ts, call `addGithubProject` twice with the same source and assert the same id and that the spawn ran once (track call count in the fake).
  - **cancelBuild during add** removes the registry entry: drive `addGithubProject` with a never-closing spawn, call `cancelBuild(id)` (id obtained by listing projects mid-flight is racy — instead assert via the rejected promise path that `listProjects()` is empty afterward).
  - **Stale cache (version mismatch) triggers rebuild on select**: write a cache with `CACHE_VERSION + 1` for the current ref, then `selectProject` and assert it rebuilds (spawn invoked) and returns docs.
- [ ] Run: `bun test` — expect the full suite PASS.
- [ ] Run: `bun run typecheck` — expect PASS.
- [ ] Commit: `test(github): adversarial coverage — empty repo, dedup, cancel, stale cache`

---

## Self-Review Notes

**Spec coverage (Plan 2 scope items → tasks):**
1. Types (github `Project` variant, `refs[]`, `currentRef`, `docsSubpath?`; `IpcApi` additions) → **Task 1**. Reconciled with current `IpcApi` by keeping `addLocalProject` and adding `addGithubProject` (no unified `addProject`).
2. GitHub source parsing/normalization (https + `owner/repo`; identity = `(source, docsSubpath)`, ref excluded) → **Task 2** (pure, unit-tested).
3. clone pipeline (`spawn`, arg array, `--depth 1 --single-branch`, `GIT_TERMINAL_PROMPT=0`, no submodules, tmpdir, cancel + cleanup) → **Task 3** (mocked spawn, no network).
4. Disk cache (per-ref `cache/<id>/<ref>/`, `manifest.json` with `cacheVersion` + tree + sections, docs map, serialized index; atomic temp+rename; version/corrupt → stale) → **Task 6**, with index (de)serialization in **Task 5**.
5. github build orchestration (clone→discover[docsSubpath/auto-scope]→parse→index→cache→delete; progress; cancelable; registry refs/currentRef) → **Task 7** (+ discover override in **Task 4**, registry recordRef in **Task 8**).
6. registry extensions (addGithubProject dedup-by-identity, per-ref tracking, currentRef) → **Task 8**; `updateProjectSettings` exposed via IPC handler `projects:updateSettings` → **Task 10** (docsSubpath-change rebuild + collision check is noted as a thin point — see Deferred/Risks).
7. projectService read path (github reads from cache; selectProject loads currentRef; switchRef builds/loads; ADR-0001 type branch) → **Task 9**.
8. IPC + preload (all handlers + `onBuildProgress` streaming) → **Task 10**.
9. Renderer (Add-project GitHub option + progress + Cancel; branch switcher; Rebuild "Pull latest"/"Reindex") → **Tasks 11–13**.
10. Tests throughout incl. adversarial → every task is TDD; **Task 14** consolidates adversarial cases.

**Type consistency vs current code:**
- `Section`, `ParsedDoc`, `NavNode`, `SearchResult`, `DocKind`, `ProjectStatus` are unchanged and reused verbatim.
- `Project` becomes a discriminated union (`LocalProject | GithubProject`); `registry.addLocalProject` already produces a `LocalProject`-shaped record, so only `updateProject`'s patch typing changes (new `ProjectPatch`). `getProject`/`listProjects`/`removeProject` signatures are unchanged.
- `discover`/`discoverDetailed` gain an **optional** trailing `options` arg — existing callers (`projectService.selectLocal`, existing tests) are unaffected.
- `buildIndex` keeps its signature; `INDEX_OPTIONS`/`serializeIndex`/`loadIndex` are additive; `runSearch`/`makeSnippet` unchanged.
- `buildTree` is moved to `src/main/tree.ts` and imported by both `projectService` and `build` (avoids a `projectService ↔ build` import cycle).
- `selectProject` still returns `{ tree, docCount }` for both types.

**Security (mandatory spec items) honored:**
- git via `spawn` **argument array** with a `--` separator (no shell, no flag injection); shallow, no submodules, `GIT_TERMINAL_PROMPT=0` (Task 3).
- Atomic cache writes (temp dir + rename); `cacheVersion` gate; orphan `.tmp-*` sweep on launch (Tasks 6, 10).
- github `getDoc` resolves from the cache **map by key membership** — no filesystem path is constructed from untrusted input (Task 9). Local `getDoc` keeps the existing `safeResolve` traversal guard; discover's `docsSubpath` is run through `safeResolve` too (Task 4).
- Existing DOMPurify/mermaid-strict/iframe rendering is untouched (renderer render path is Plan 1's; github docs flow through the same `DocView`).

**Tensions / decisions to flag:**
- **IPC naming**: spec lists a unified `addProject({type,...})` and `getProjectTree(id)`; the current code uses per-method handlers and folds the tree into `selectProject`. This plan follows the **current** convention (adds `addGithubProject`, keeps `selectProject`/`switchRef` returning `{ tree, docCount }`). If a later plan wants the spec's unified surface, that's a separate refactor.
- **`updateProjectSettings` docsSubpath change**: the IPC handler wires it to `registry.updateProject` (instant name/themeId patch). The spec also requires that a **docsSubpath change triggers a rebuild + identity-collision check**. This plan exposes the setting but leaves the rebuild-on-docsSubpath-change orchestration thin (collision check + forced rebuild) — explicitly **deferred to the Manage Projects view (Plan 3)** where settings editing lives. Called out so it isn't mistaken for complete.
- **Default-branch resolution**: when no ref is typed, the build clones the default branch and resolves its name via `git rev-parse --abbrev-ref HEAD` (Task 3) so the recorded ref is the real branch name, matching the spec's "currentRef defaults to HEAD."
- **Atomic rename window**: `writeCache` does `rm(target)` then `rename(tmp → target)`; there is a sub-millisecond window where `target` is absent. Acceptable for v1 (a concurrent read would just see "no cache" and rebuild); a rename-to-backup dance is a possible hardening if it ever matters.
- **Renderer test harness**: Tasks 11–12 assume the repo's existing jsdom DOM-test pattern extends to component rendering via `react-dom/client`. If the existing renderer test uses a different approach, match it; the assertions are the contract, not the harness mechanics.

**Explicitly deferred (noted per the brief):**
- Full **Manage Projects view** (sortable table, per-row edit/delete, docsSubpath editing with rebuild+collision) → **Plan 3**.
- **File-watch (E2), session memory (E3), ⌘K command palette (E4)** → **Plan 4**.
- **Theming editor** (`themeId` field exists on `ProjectBase`; editor UI) → **Plan 5** (partly exists today).
- SSH-URL input parsing, cross-project search (E1), export (E6), code-signing — out of scope per spec.

**Scope split confirmed:** Yes — Plan **2a** (Tasks 1–10, backend: clone/cache/refs/IPC, headless-testable) and Plan **2b** (Tasks 11–14, GitHub UI). 2a is independently shippable.
