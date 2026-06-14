import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setBaseDir } from '../src/main/paths'
import { listProjects, addLocalProject, removeProject } from '../src/main/registry'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dv-reg-'))
  setBaseDir(dir)
})

describe('registry', () => {
  it('adds a local project with a derived name and uuid', async () => {
    const p = await addLocalProject('/Users/me/projects/mews-two')
    expect(p.name).toBe('mews-two')
    expect(p.type).toBe('local')
    expect(p.id).toMatch(/[0-9a-f-]{36}/)
    expect(await listProjects()).toHaveLength(1)
    await rm(dir, { recursive: true, force: true })
  })

  it('dedupes by absolute source', async () => {
    const a = await addLocalProject('/Users/me/docs')
    const b = await addLocalProject('/Users/me/docs')
    expect(b.id).toBe(a.id)
    expect(await listProjects()).toHaveLength(1)
    await rm(dir, { recursive: true, force: true })
  })

  it('removes a project', async () => {
    const p = await addLocalProject('/Users/me/docs')
    await removeProject(p.id)
    expect(await listProjects()).toHaveLength(0)
    await rm(dir, { recursive: true, force: true })
  })
})
