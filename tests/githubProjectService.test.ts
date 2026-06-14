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
