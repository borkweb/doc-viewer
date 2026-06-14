import { describe, it, expect, beforeEach } from 'bun:test'
import { mkdtemp, rm, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setBaseDir } from '../src/main/paths'
import {
  writeCache, readCache, hasCache, purgeProjectCache, sweepOrphans,
  CACHE_VERSION, type CacheData
} from '../src/main/cache'
import { projectCacheDir, refCacheDir } from '../src/main/paths'

let dir: string
function sampleData(version = CACHE_VERSION): CacheData {
  return {
    manifest: {
      cacheVersion: version, ref: 'main', builtAt: 'now', docCount: 1,
      tree: [{ type: 'doc', name: 'a.md', title: 'Alpha', path: 'a.md', kind: 'md' }],
      sections: [{ id: 'a.md#', docPath: 'a.md', docTitle: 'Alpha', headingId: '', headingText: '', depth: 0, text: 'hi' }]
    },
    docs: { 'a.md': { kind: 'md', content: '# Alpha' } },
    indexJson: '{"fake":"index"}'
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dv-cache-'))
  setBaseDir(dir)
})

describe('cache', () => {
  it('roundtrips a ref cache', async () => {
    await writeCache('p1', 'main', sampleData())
    expect(await hasCache('p1', 'main')).toBe(true)
    const c = await readCache('p1', 'main')
    expect(c?.manifest.docCount).toBe(1)
    expect(c?.docs['a.md'].content).toBe('# Alpha')
    expect(c?.indexJson).toBe('{"fake":"index"}')
    await rm(dir, { recursive: true, force: true })
  })

  it('treats a version mismatch as stale (returns null)', async () => {
    await writeCache('p1', 'main', sampleData(CACHE_VERSION + 99))
    expect(await readCache('p1', 'main')).toBeNull()
    await rm(dir, { recursive: true, force: true })
  })

  it('treats a corrupt manifest as stale (returns null)', async () => {
    await writeCache('p1', 'main', sampleData())
    await writeFile(join(refCacheDir('p1', 'main'), 'manifest.json'), '{ not json', 'utf8')
    expect(await readCache('p1', 'main')).toBeNull()
    await rm(dir, { recursive: true, force: true })
  })

  it('returns null for a missing ref', async () => {
    expect(await readCache('p1', 'nope')).toBeNull()
    expect(await hasCache('p1', 'nope')).toBe(false)
    await rm(dir, { recursive: true, force: true })
  })

  it('encodes slash-bearing refs into a safe dir name', async () => {
    await writeCache('p1', 'feature/x', sampleData())
    const c = await readCache('p1', 'feature/x')
    expect(c?.docs['a.md'].content).toBe('# Alpha')
    // The on-disk dir name is not a nested path.
    const entries = await readdir(projectCacheDir('p1'))
    expect(entries.some((e) => e.includes('/'))).toBe(false)
    await rm(dir, { recursive: true, force: true })
  })

  it('overwrites an existing ref atomically without leaving temp dirs', async () => {
    await writeCache('p1', 'main', sampleData())
    const updated = sampleData()
    updated.manifest.docCount = 7
    await writeCache('p1', 'main', updated)
    expect((await readCache('p1', 'main'))?.manifest.docCount).toBe(7)
    const entries = await readdir(projectCacheDir('p1'))
    expect(entries.some((e) => e.startsWith('.tmp-'))).toBe(false)
    await rm(dir, { recursive: true, force: true })
  })

  it('purges all refs of a project', async () => {
    await writeCache('p1', 'main', sampleData())
    await writeCache('p1', 'dev', sampleData())
    await purgeProjectCache('p1')
    await expect(stat(projectCacheDir('p1'))).rejects.toThrow()
    await rm(dir, { recursive: true, force: true })
  })

  it('sweeps orphaned temp dirs left by an interrupted write', async () => {
    await mkdir(join(projectCacheDir('p1'), '.tmp-orphan'), { recursive: true })
    await sweepOrphans()
    const entries = await readdir(projectCacheDir('p1')).catch(() => [])
    expect(entries.some((e) => e.startsWith('.tmp-'))).toBe(false)
    await rm(dir, { recursive: true, force: true })
  })
})
