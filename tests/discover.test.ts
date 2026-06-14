import { describe, it, expect } from 'bun:test'
import { resolve } from 'node:path'
import { discover, discoverDetailed } from '../src/main/pipeline/discover'

const root = resolve('tests/fixtures/sample-docs')
const scopedRoot = resolve('tests/fixtures/scoped-docs')

describe('discover', () => {
  it('finds markdown and orphan html, ignoring vendor dirs', async () => {
    const docs = await discover(root)
    const paths = docs.map((d) => d.path).sort()
    expect(paths).toContain('README.md')
    expect(paths).toContain('01-intro.md')
    expect(paths).toContain('guide/02-setup.md')
    expect(paths).toContain('db.md')
    expect(paths).toContain('standalone.html')
  })

  it('skips a generated .html when a same-named .md exists (1A)', async () => {
    const docs = await discover(root)
    const paths = docs.map((d) => d.path)
    expect(paths).not.toContain('db.html')
  })

  it('ignores node_modules', async () => {
    const docs = await discover(root)
    const paths = docs.map((d) => d.path)
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false)
  })

  it('tags kind correctly', async () => {
    const docs = await discover(root)
    expect(docs.find((d) => d.path === 'db.md')!.kind).toBe('md')
    expect(docs.find((d) => d.path === 'standalone.html')!.kind).toBe('html')
  })

  it('still walks the whole tree when no docs/ folder exists (no scoping)', async () => {
    const docs = await discover(root)
    const paths = docs.map((d) => d.path)
    expect(paths).toContain('guide/02-setup.md')
  })
})

describe('discover (docs/ folder scoping)', () => {
  it('scopes to root-level docs + the docs/documentation folder subtrees', async () => {
    const docs = await discover(scopedRoot)
    const paths = docs.map((d) => d.path).sort()
    // Root-level doc files are included.
    expect(paths).toContain('README.md')
    expect(paths).toContain('notes.md')
    // Everything under the matched docs/ folder is included (recursively).
    expect(paths).toContain('docs/guide.md')
    expect(paths).toContain('docs/sub/deep.md')
    // A second matched folder (documentation/) is also included.
    expect(paths).toContain('documentation/extra.md')
  })

  it('excludes markdown in other root-level subfolders', async () => {
    const docs = await discover(scopedRoot)
    const paths = docs.map((d) => d.path)
    expect(paths).not.toContain('src/internal.md')
    expect(paths).not.toContain('adr/0001.md')
  })

  it('records one skip per excluded root subdir with an out-of-scope reason', async () => {
    const { skipped } = await discoverDetailed(scopedRoot)
    const src = skipped.find((s) => s.path === 'src')
    const adr = skipped.find((s) => s.path === 'adr')
    expect(src).toBeDefined()
    expect(adr).toBeDefined()
    expect(src!.reason).toContain('docs/ scope')
    // No per-file skips inside excluded dirs.
    expect(skipped.some((s) => s.path.startsWith('src/'))).toBe(false)
    expect(skipped.some((s) => s.path.startsWith('adr/'))).toBe(false)
  })
})
