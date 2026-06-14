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

    // Delete the clone before reporting `done` so `done` is the terminal stage
    // the renderer observes; the finally below still guards the error/cancel path.
    emit('cleanup')
    await rm(cloneDir, { recursive: true, force: true })
    cloneDir = null

    emit('done', { docCount: parsed.length })
    return { ref, docCount: parsed.length }
  } finally {
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true })
  }
}
