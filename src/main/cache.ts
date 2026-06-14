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
