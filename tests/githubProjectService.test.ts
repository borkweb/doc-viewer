import { describe, it, expect, beforeEach } from 'bun:test'
import { EventEmitter } from 'node:events'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
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

import { cancelBuild } from '../src/main/projectService'
import { listProjects } from '../src/main/registry'
import { writeCache, readCache, CACHE_VERSION } from '../src/main/cache'

// repoSpawn variant that counts how many git invocations happen.
function countingSpawn(files: Record<string, string>, onCall: () => void) {
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

// A spawn whose child never closes on its own; kill emits close so cancel resolves.
const neverSpawn = ((cmd: string, args: string[]) => {
  const child = new EventEmitter() as unknown as { stdout: EventEmitter; stderr: EventEmitter; kill: () => void }
  ;(child as { stdout: EventEmitter }).stdout = new EventEmitter()
  ;(child as { stderr: EventEmitter }).stderr = new EventEmitter()
  ;(child as { kill: () => void }).kill = () => (child as unknown as EventEmitter).emit('close', null)
  return child as never
}) as never

describe('github projectService (adversarial)', () => {
  it('selects an empty repo as an empty tree', async () => {
    const spawnFn = repoSpawn({})
    const p = await addGithubProject('o/r', { ref: 'main' }, () => {}, { spawnFn })
    const { tree, docCount } = await selectProject(p.id)
    expect(docCount).toBe(0)
    expect(tree).toEqual([])
  })

  it('docsSubpath override hides the root README from cached reads', async () => {
    const spawnFn = repoSpawn({ 'README.md': '# Root', 'pkg/notes.md': '# Notes' })
    const p = await addGithubProject('o/r', { ref: 'main', docsSubpath: 'pkg' }, () => {}, { spawnFn })
    await selectProject(p.id)
    const doc = await getDoc(p.id, 'pkg/notes.md')
    expect(doc.content).toContain('# Notes')
    await expect(getDoc(p.id, 'README.md')).rejects.toThrow(/not in cache/i)
  })

  it('re-adding an identical identity returns the same project without a second build', async () => {
    let calls = 0
    const spawnFn = countingSpawn({ 'a.md': '# A' }, () => { calls++ })
    const p1 = await addGithubProject('o/r', { ref: 'main' }, () => {}, { spawnFn })
    const p2 = await addGithubProject('https://github.com/o/r.git', { ref: 'main' }, () => {}, { spawnFn })
    expect(p2.id).toBe(p1.id)
    expect(calls).toBe(1) // clone ran once; the dedup'd re-add did not build
    expect(await listProjects()).toHaveLength(1)
  })

  it('cancelBuild during an add removes the registry entry', async () => {
    const promise = addGithubProject('o/r', { ref: 'main' }, () => {}, { spawnFn: neverSpawn })
    // Let the registry write + clone spawn happen, then cancel by the recorded id.
    await new Promise((r) => setTimeout(r, 25))
    const mid = await listProjects()
    expect(mid).toHaveLength(1)
    cancelBuild(mid[0].id)
    await expect(promise).rejects.toThrow(/cancel/i)
    expect(await listProjects()).toHaveLength(0)
  })

  it('a stale-version cache triggers a rebuild on ref load', async () => {
    let calls = 0
    const spawnFn = countingSpawn({ 'a.md': '# A' }, () => { calls++ })
    const p = await addGithubProject('o/r', { ref: 'main' }, () => {}, { spawnFn })
    expect(calls).toBe(1)

    // Corrupt the cached ref with a future cacheVersion → readCache treats it stale.
    const cache = (await readCache(p.id, 'main'))!
    cache.manifest.cacheVersion = CACHE_VERSION + 1
    await writeCache(p.id, 'main', cache)

    // switchRef to the same ref: hasCache() is false (stale) → rebuild, then load.
    const { docCount } = await switchRef(p.id, 'main', () => {}, { spawnFn })
    expect(docCount).toBe(1)
    expect(calls).toBe(2) // rebuilt because the cache was stale
  })
})
