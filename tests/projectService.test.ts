import { describe, it, expect, beforeEach } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setBaseDir } from '../src/main/paths'
import { addLocalProject } from '../src/main/registry'
import { selectProject, getDoc, search } from '../src/main/projectService'

let dir: string
const fixtures = resolve('tests/fixtures/sample-docs')

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dv-svc-'))
  setBaseDir(dir)
})

describe('projectService', () => {
  it('selects a local project and returns a nav tree', async () => {
    const p = await addLocalProject(fixtures)
    const { tree, docCount } = await selectProject(p.id)
    expect(docCount).toBeGreaterThan(0)
    const names = tree.map((n) => n.name)
    expect(names).toContain('guide') // folder
    await rm(dir, { recursive: true, force: true })
  })

  it('reads a document live', async () => {
    const p = await addLocalProject(fixtures)
    await selectProject(p.id)
    const doc = await getDoc(p.id, 'db.md')
    expect(doc.kind).toBe('md')
    expect(doc.content).toContain('# Database')
    await rm(dir, { recursive: true, force: true })
  })

  it('rejects traversal in getDoc', async () => {
    const p = await addLocalProject(fixtures)
    await selectProject(p.id)
    await expect(getDoc(p.id, '../../etc/passwd')).rejects.toThrow(/outside project/i)
    await rm(dir, { recursive: true, force: true })
  })

  it('searches the active index', async () => {
    const p = await addLocalProject(fixtures)
    await selectProject(p.id)
    const results = await search(p.id, 'setup')
    expect(results.some((r) => r.docPath === 'guide/02-setup.md')).toBe(true)
    await rm(dir, { recursive: true, force: true })
  })
})
