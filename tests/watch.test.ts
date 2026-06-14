import { describe, it, expect } from 'bun:test'
import { startWatch, type WatchFn } from '../src/main/watcher'

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
