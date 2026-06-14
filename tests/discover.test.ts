import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { discover } from '../src/main/pipeline/discover'

const root = resolve('tests/fixtures/sample-docs')

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
})
