import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Project, GithubProject, ProjectPatch } from '@shared/types'
import { projectsFile, userDataDir } from './paths'
import { parseGithubSource, defaultGithubName, githubIdentity } from './util/github'

async function readAll(): Promise<Project[]> {
  try {
    const raw = await readFile(projectsFile(), 'utf8')
    return JSON.parse(raw) as Project[]
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    // Corrupt registry: treat as empty rather than crashing the app.
    return []
  }
}

async function writeAll(projects: Project[]): Promise<void> {
  await mkdir(userDataDir(), { recursive: true })
  await writeFile(projectsFile(), JSON.stringify(projects, null, 2), 'utf8')
}

export async function listProjects(): Promise<Project[]> {
  return readAll()
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await readAll()).find((p) => p.id === id)
}

export async function addLocalProject(source: string, name?: string): Promise<Project> {
  const projects = await readAll()
  const existing = projects.find((p) => p.type === 'local' && p.source === source)
  if (existing) return existing
  const project: Project = {
    id: randomUUID(),
    name: name?.trim() || basename(source) || source,
    type: 'local',
    source,
    addedAt: new Date().toISOString(),
    status: 'ok'
  }
  projects.push(project)
  await writeAll(projects)
  return project
}

export async function updateProject(id: string, patch: ProjectPatch): Promise<Project> {
  const projects = await readAll()
  const idx = projects.findIndex((p) => p.id === id)
  if (idx < 0) throw new Error(`Project not found: ${id}`)
  projects[idx] = { ...projects[idx], ...patch, id: projects[idx].id, type: projects[idx].type } as Project
  await writeAll(projects)
  return projects[idx]
}

export async function removeProject(id: string): Promise<void> {
  const projects = await readAll()
  await writeAll(projects.filter((p) => p.id !== id))
}

export async function addGithubProject(
  input: string,
  opts: { name?: string; docsSubpath?: string } = {}
): Promise<{ project: GithubProject; created: boolean }> {
  const src = parseGithubSource(input)
  const docsSubpath = opts.docsSubpath?.trim() || undefined
  const projects = await readAll()
  const identity = githubIdentity(src.url, docsSubpath)
  const existing = projects.find(
    (p): p is GithubProject =>
      p.type === 'github' && githubIdentity(p.source, p.docsSubpath) === identity
  )
  if (existing) return { project: existing, created: false }

  const project: GithubProject = {
    id: randomUUID(),
    name: opts.name?.trim() || defaultGithubName(src, docsSubpath),
    type: 'github',
    source: src.url,
    docsSubpath,
    refs: [],
    currentRef: '',
    addedAt: new Date().toISOString(),
    status: 'building'
  }
  projects.push(project)
  await writeAll(projects)
  return { project, created: true }
}

export async function findGithubByIdentity(
  source: string,
  docsSubpath: string | undefined,
  excludeId?: string
): Promise<GithubProject | undefined> {
  const identity = githubIdentity(source, docsSubpath)
  const projects = await readAll()
  return projects.find(
    (p): p is GithubProject =>
      p.type === 'github' &&
      p.id !== excludeId &&
      githubIdentity(p.source, p.docsSubpath) === identity
  )
}

function requireGithub(projects: Project[], id: string): GithubProject {
  const p = projects.find((x) => x.id === id)
  if (!p) throw new Error(`Project not found: ${id}`)
  if (p.type !== 'github') throw new Error(`Not a github project: ${id}`)
  return p
}

export async function recordRef(id: string, ref: string, docCount: number): Promise<GithubProject> {
  const projects = await readAll()
  const p = requireGithub(projects, id)
  const now = new Date().toISOString()
  const existing = p.refs.find((r) => r.ref === ref)
  if (existing) {
    existing.lastBuiltAt = now
    existing.docCount = docCount
  } else {
    p.refs.push({ ref, lastBuiltAt: now, docCount })
  }
  if (!p.currentRef) p.currentRef = ref
  p.status = 'ok'
  await writeAll(projects)
  return p
}

export async function setCurrentRef(id: string, ref: string): Promise<GithubProject> {
  const projects = await readAll()
  const p = requireGithub(projects, id)
  p.currentRef = ref
  await writeAll(projects)
  return p
}

export async function removeRefRecord(id: string, ref: string): Promise<GithubProject> {
  const projects = await readAll()
  const p = requireGithub(projects, id)
  p.refs = p.refs.filter((r) => r.ref !== ref)
  if (p.currentRef === ref) p.currentRef = p.refs[0]?.ref ?? ''
  await writeAll(projects)
  return p
}
