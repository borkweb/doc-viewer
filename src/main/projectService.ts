import { readFile } from 'node:fs/promises'
import type { spawn } from 'node:child_process'
import type MiniSearch from 'minisearch'
import type {
  NavNode, ParsedDoc, SearchResult, DocKind, Project, GithubProject, BuildProgress, IndexChanged
} from '@shared/types'
import {
  getProject, updateProject, removeProject as registryRemoveProject,
  addGithubProject as registryAddGithub, recordRef, setCurrentRef, removeRefRecord,
  findGithubByIdentity
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

export type ProjectGenerationToken = number
type IndexSink = (payload: IndexChanged) => void
let indexSink: IndexSink | null = null
let generation: ProjectGenerationToken = 0

export function setIndexSink(sink: IndexSink | null): void {
  indexSink = sink
}

export function getGenerationToken(): ProjectGenerationToken {
  return generation
}

export function stopWatch(): void {
  generation += 1
}

export function releaseIfActive(id: string): void {
  if (active?.id === id) {
    stopWatch()
    active = null
  }
}

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

// ── docsSubpath change (github) ─────────────────────────────────────────────
export async function setDocsSubpath(
  id: string,
  subpath: string,
  onProgress: (p: BuildProgress) => void = noProgress,
  deps: BuildDeps = {}
): Promise<{ tree: NavNode[]; docCount: number }> {
  const project = await getProject(id)
  if (!project) throw new Error(`Project not found: ${id}`)
  if (project.type !== 'github') throw new Error(`Not a github project: ${id}`)

  if (inFlight.has(id)) {
    const err = new Error('Build already in progress') as Error & { code?: string }
    err.code = 'build-in-progress'
    throw err
  }

  const present = async (ref: string): Promise<{ tree: NavNode[]; docCount: number }> => {
    const current = await getProject(id)
    if (!current || current.type !== 'github') throw new Error(`Not a github project: ${id}`)
    if (active?.id === id) return loadGithubRef(current, ref, onProgress, deps)
    const cache = await readCache(id, ref)
    if (!cache) throw new Error(`Cache unavailable after build: ${id}@${ref}`)
    return { tree: cache.manifest.tree, docCount: cache.manifest.docCount }
  }

  const normalized = subpath.trim() || undefined
  if ((project.docsSubpath ?? undefined) === normalized) return present(project.currentRef)

  const collision = await findGithubByIdentity(project.source, normalized, id)
  if (collision) {
    const err = new Error(
      `docsSubpath collision: another project already uses ${project.source} + ${normalized ?? '(root)'}`
    ) as Error & { code?: string }
    err.code = 'collision'
    throw err
  }

  await updateProject(id, { docsSubpath: normalized })
  await purgeProjectCache(id)
  const updated = (await getProject(id)) as GithubProject

  const controller = new AbortController()
  inFlight.set(id, controller)
  try {
    const { ref, docCount } = await buildGithubRef(
      updated,
      updated.currentRef,
      onProgress,
      controller.signal,
      deps
    )
    await recordRef(id, ref, docCount)
  } finally {
    inFlight.delete(id)
  }

  return present(updated.currentRef)
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
