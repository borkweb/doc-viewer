import { describe, it, expect, beforeEach } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setBaseDir } from '../src/main/paths'
import {
  addGithubProject, recordRef, setCurrentRef, removeRefRecord,
  listProjects, getProject, updateProject
} from '../src/main/registry'
import type { GithubProject } from '../src/shared/types'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dv-ghreg-'))
  setBaseDir(dir)
})

describe('github registry', () => {
  it('adds a github project with a normalized source + derived name', async () => {
    const { project, created } = await addGithubProject('octocat/Hello-World')
    expect(created).toBe(true)
    expect(project.type).toBe('github')
    expect(project.source).toBe('https://github.com/octocat/Hello-World')
    expect(project.name).toBe('octocat/Hello-World')
    expect(project.status).toBe('building')
    expect(project.refs).toEqual([])
    await rm(dir, { recursive: true, force: true })
  })

  it('dedupes by identity (source + docsSubpath), ref excluded', async () => {
    const a = await addGithubProject('octocat/Hello-World')
    const b = await addGithubProject('https://github.com/octocat/Hello-World.git')
    expect(b.created).toBe(false)
    expect(b.project.id).toBe(a.project.id)
    // A different docsSubpath is a distinct identity → distinct project.
    const c = await addGithubProject('octocat/Hello-World', { docsSubpath: 'docs' })
    expect(c.created).toBe(true)
    expect(c.project.id).not.toBe(a.project.id)
    expect(await listProjects()).toHaveLength(2)
    await rm(dir, { recursive: true, force: true })
  })

  it('records refs and defaults currentRef to the first built ref', async () => {
    const { project } = await addGithubProject('o/r')
    await recordRef(project.id, 'main', 5)
    let p = (await getProject(project.id)) as GithubProject
    expect(p.currentRef).toBe('main')
    expect(p.refs).toEqual([{ ref: 'main', lastBuiltAt: expect.any(String), docCount: 5 }])
    expect(p.status).toBe('ok')
    await recordRef(project.id, 'dev', 2)
    await recordRef(project.id, 'main', 6) // re-build updates in place
    p = (await getProject(project.id)) as GithubProject
    expect(p.refs).toHaveLength(2)
    expect(p.refs.find((r) => r.ref === 'main')!.docCount).toBe(6)
    await rm(dir, { recursive: true, force: true })
  })

  it('switches and removes refs, repointing currentRef when needed', async () => {
    const { project } = await addGithubProject('o/r')
    await recordRef(project.id, 'main', 1)
    await recordRef(project.id, 'dev', 1)
    await setCurrentRef(project.id, 'dev')
    await removeRefRecord(project.id, 'dev')
    const p = (await getProject(project.id)) as GithubProject
    expect(p.refs.map((r) => r.ref)).toEqual(['main'])
    expect(p.currentRef).toBe('main') // repointed away from the removed ref
    await rm(dir, { recursive: true, force: true })
  })

  it('updateProject patches a github field without losing the discriminant', async () => {
    const { project } = await addGithubProject('o/r')
    const updated = await updateProject(project.id, { name: 'Renamed' })
    expect(updated.name).toBe('Renamed')
    expect(updated.type).toBe('github')
    await rm(dir, { recursive: true, force: true })
  })
})
