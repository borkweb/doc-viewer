import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Project } from '@shared/types'
import { projectsFile, userDataDir } from './paths'

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

export async function updateProject(id: string, patch: Partial<Project>): Promise<Project> {
  const projects = await readAll()
  const idx = projects.findIndex((p) => p.id === id)
  if (idx < 0) throw new Error(`Project not found: ${id}`)
  projects[idx] = { ...projects[idx], ...patch, id: projects[idx].id }
  await writeAll(projects)
  return projects[idx]
}

export async function removeProject(id: string): Promise<void> {
  const projects = await readAll()
  await writeAll(projects.filter((p) => p.id !== id))
}
