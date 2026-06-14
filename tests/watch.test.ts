import { describe, it, expect, beforeEach } from 'bun:test'
import { EventEmitter } from 'node:events'
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { startWatch, type WatchFn } from '../src/main/watcher'
import { setBaseDir } from '../src/main/paths'
import { addLocalProject } from '../src/main/registry'
import {
  selectProject,
  setIndexSink,
  stopWatch,
  releaseIfActive,
  getDoc,
  addGithubProject
} from '../src/main/projectService'

function fakeWatch(): { fn: WatchFn; fire: () => void; opts: () => { recursive?: boolean }; closes: () => number } {
  let cb: () => void = () => {}
  let received: { recursive?: boolean } = {}
  let closed = 0
  const fn = ((_root: string, options: { recursive?: boolean }, listener: () => void) => {
    received = options
    cb = listener
    return { on: () => {}, close: () => { closed += 1 } }
  }) as unknown as WatchFn
  return { fn, fire: () => cb(), opts: () => received, closes: () => closed }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('startWatch', () => {
  it('coalesces a burst into one trailing reindex (leading edge suppressed)', async () => {
    const watcher = fakeWatch()
    let calls = 0
    const handle = startWatch('/root', () => { calls += 1 }, {
      debounceMs: 20,
      watchFn: watcher.fn,
      platform: 'darwin'
    })
    watcher.fire()
    watcher.fire()
    watcher.fire()
    expect(calls).toBe(0)
    await delay(40)
    expect(calls).toBe(1)
    handle.close()
  })

  it('close() cancels a pending trailing fire', async () => {
    const watcher = fakeWatch()
    let calls = 0
    const handle = startWatch('/root', () => { calls += 1 }, {
      debounceMs: 20,
      watchFn: watcher.fn,
      platform: 'darwin'
    })
    watcher.fire()
    handle.close()
    await delay(40)
    expect(calls).toBe(0)
  })

  it('degrades to a non-recursive watch on linux', () => {
    const watcher = fakeWatch()
    const handle = startWatch('/root', () => {}, { watchFn: watcher.fn, platform: 'linux' })
    expect(watcher.opts().recursive).toBe(false)
    handle.close()
  })

  it('uses a recursive watch on macOS/Windows', () => {
    const watcher = fakeWatch()
    const handle = startWatch('/root', () => {}, { watchFn: watcher.fn, platform: 'darwin' })
    expect(watcher.opts().recursive).toBe(true)
    handle.close()
  })

  it('fails soft when watch throws (returns a usable no-op handle)', () => {
    const throwing = (() => { throw new Error('ENOSYS') }) as WatchFn
    const handle = startWatch('/root', () => {}, { watchFn: throwing, platform: 'darwin' })
    expect(() => handle.close()).not.toThrow()
  })
})

function repoSpawn(files: Record<string, string>): never {
  return (((_cmd: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
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
        await mkdir(dirname(abs), { recursive: true })
        await writeFile(abs, content)
      }
      child.emit('close', 0)
    })
    return child
  }) as never)
}

describe('watcher lifecycle (projectService)', () => {
  beforeEach(async () => {
    setBaseDir(await mkdtemp(join(tmpdir(), 'dv-watch-')))
    setIndexSink(null)
    stopWatch()
  })

  async function localProject(fileCount = 1): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'dv-localproj-'))
    await writeFile(join(dir, 'a.md'), '# A')
    if (fileCount > 1) {
      await Promise.all(Array.from({ length: fileCount - 1 }, (_, index) =>
        writeFile(join(dir, `doc-${index}.md`), `# Doc ${index}\n\n${'content '.repeat(200)}`)
      ))
    }
    const project = await addLocalProject(dir)
    return project.id
  }

  it('selecting a local project starts a watcher; a fired event pushes index:changed once', async () => {
    const id = await localProject()
    const pushes: { projectId: string }[] = []
    setIndexSink((payload) => pushes.push(payload))
    const watcher = fakeWatch()
    await selectProject(id, { watchFn: watcher.fn, debounceMs: 20 })
    watcher.fire()
    await delay(40)
    expect(pushes.length).toBe(1)
    expect(pushes[0].projectId).toBe(id)
  })

  it('drops a watcher event for a project the user has switched away from', async () => {
    const a = await localProject()
    const b = await localProject()
    const pushes: { projectId: string }[] = []
    setIndexSink((payload) => pushes.push(payload))
    const wa = fakeWatch()
    const wb = fakeWatch()
    await selectProject(a, { watchFn: wa.fn, debounceMs: 20 })
    await selectProject(b, { watchFn: wb.fn, debounceMs: 20 })
    wa.fire()
    await delay(40)
    expect(pushes.filter((payload) => payload.projectId === a).length).toBe(0)
  })

  it('a project switch mid-reindex keeps active on the new project and pushes nothing stale (MF1)', async () => {
    const a = await localProject()
    const b = await localProject()
    const pushes: { projectId: string }[] = []
    setIndexSink((payload) => pushes.push(payload))
    const wa = fakeWatch()
    const wb = fakeWatch()
    let releaseRead!: () => void
    let blocked = false
    const gate = new Promise<void>((resolve) => { releaseRead = resolve })
    const readFileFn = (async (path, encoding) => {
      blocked = true
      await gate
      return readFile(path, encoding)
    }) as typeof readFile
    await selectProject(a, { watchFn: wa.fn, debounceMs: 10, readFileFn })
    wa.fire()
    await delay(15)
    expect(blocked).toBe(true)
    await selectProject(b, { watchFn: wb.fn, debounceMs: 10 })
    releaseRead()
    await delay(15)
    await expect(getDoc(b, 'a.md')).resolves.toBeTruthy()
    expect(pushes.some((payload) => payload.projectId === a)).toBe(false)
  })

  it('re-selecting tears down the previous watcher and stopWatch is idempotent (MF2)', async () => {
    const id = await localProject()
    const w1 = fakeWatch()
    await selectProject(id, { watchFn: w1.fn, debounceMs: 20 })
    const w2 = fakeWatch()
    await selectProject(id, { watchFn: w2.fn, debounceMs: 20 })
    expect(w1.closes()).toBe(1)
    stopWatch()
    expect(w2.closes()).toBe(1)
    expect(() => stopWatch()).not.toThrow()
  })

  it('releaseIfActive stops the active local watcher and clears active (MF3)', async () => {
    const id = await localProject()
    const watcher = fakeWatch()
    await selectProject(id, { watchFn: watcher.fn, debounceMs: 20 })
    expect(watcher.closes()).toBe(0)
    releaseIfActive(id)
    expect(watcher.closes()).toBe(1)
    await expect(getDoc(id, 'a.md')).rejects.toThrow()
  })

  it('selecting a github project starts no watcher', async () => {
    let started = 0
    const watchFn = (() => {
      started += 1
      return { on: () => {}, close: () => {} }
    }) as unknown as WatchFn
    const gh = await addGithubProject('o/r', { ref: 'main' }, () => {}, {
      spawnFn: repoSpawn({ 'README.md': '# R' })
    })
    await selectProject(gh.id, { watchFn })
    expect(started).toBe(0)
  })
})
