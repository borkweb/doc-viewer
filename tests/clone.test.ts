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
