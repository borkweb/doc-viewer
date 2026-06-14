import { describe, it, expect, beforeEach } from 'bun:test'
import { EventEmitter } from 'node:events'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
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
