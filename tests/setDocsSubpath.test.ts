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

function repoSpawn(files: Record<string, string>, onCall: () => void = () => {}) {
  return ((_cmd: string, args: string[]) => {
    onCall()
    const child = new EventEmitter() as unknown as {
      stdout: EventEmitter
      stderr: EventEmitter
      kill: () => void
    }
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
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
    const a = await addGithubProject('o/r', { ref: 'main' }, () => {}, { spawnFn })
    await addGithubProject('o/r', { ref: 'main', docsSubpath: 'pkg' }, () => {}, { spawnFn })
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
    expect(calls).toBe(1)
  })

  it('editing a non-active project does not change which project is active', async () => {
    const spawnFn = repoSpawn({ 'README.md': '# Root', 'pkg/notes.md': '# Notes' })
    const a = await addGithubProject('o/a', { ref: 'main' }, () => {}, { spawnFn })
    const b = await addGithubProject('o/b', { ref: 'main' }, () => {}, { spawnFn })
    await selectProject(a.id)
    const res = await setDocsSubpath(b.id, 'pkg', () => {}, { spawnFn })
    expect(res.docCount).toBe(1)
    expect(((await getProject(b.id)) as GithubProject).docsSubpath).toBe('pkg')
    expect((await getDoc(a.id, 'README.md')).content).toContain('# Root')
  })

  it('rejects a concurrent build with a build-in-progress error and does not start a second build', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    let builds = 0
    const gatedSpawn = ((_cmd: string, args: string[]) => {
      builds++
      const child = new EventEmitter() as unknown as {
        stdout: EventEmitter
        stderr: EventEmitter
        kill: () => void
      }
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.kill = () => {}
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
    while (builds === 0) await new Promise((resolve) => setTimeout(resolve, 0))
    await expect(setDocsSubpath(p.id, 'docs', () => {}, { spawnFn: gatedSpawn }))
      .rejects.toMatchObject({ code: 'build-in-progress' })
    release()
    await first
    expect(builds).toBe(1)
  })

  it('clearing the subpath (back to root) re-includes the root README', async () => {
    const spawnFn = repoSpawn({ 'README.md': '# Root', 'pkg/notes.md': '# Notes' })
    const p = await addGithubProject('o/r', { ref: 'main', docsSubpath: 'pkg' }, () => {}, { spawnFn })
    const res = await setDocsSubpath(p.id, '', () => {}, { spawnFn })
    expect(res.docCount).toBe(2)
    expect(((await getProject(p.id)) as GithubProject).docsSubpath).toBeUndefined()
    await selectProject(p.id)
    expect((await getDoc(p.id, 'README.md')).content).toContain('# Root')
  })
})
