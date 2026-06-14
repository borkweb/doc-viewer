import { describe, it, expect, beforeEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ManageProjects, { type ManageProjectsProps } from '../src/renderer/src/components/ManageProjects'
import type { BuildProgress, Project } from '../src/shared/types'

let container: HTMLDivElement
let root: Root
let progressListener: ((p: BuildProgress) => void) | null

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  progressListener = null
})

function stubApi(): void {
  ;(window as unknown as { api: Partial<Window['api']> }).api = {
    onBuildProgress: (cb) => {
      progressListener = cb
      return () => {
        progressListener = null
      }
    }
  }
}

function localProject(over: Partial<Project> = {}): Project {
  return {
    id: 'local-1',
    type: 'local',
    name: 'Local Alpha',
    source: '/Users/matt/projects/personal/a-very-long-local-documentation-source',
    addedAt: '2026-06-01T10:00:00.000Z',
    status: 'ok',
    lastBuiltAt: '2026-06-12T12:00:00.000Z',
    docCount: 7,
    ...over
  } as Project
}

function githubProject(over: Partial<Project> = {}): Project {
  return {
    id: 'github-1',
    type: 'github',
    name: 'Repo Docs',
    source: 'https://github.com/example/a-very-long-repository-name-for-doc-viewer',
    addedAt: '2026-06-02T10:00:00.000Z',
    status: 'ok',
    docsSubpath: 'docs',
    currentRef: 'main',
    refs: [
      { ref: 'main', lastBuiltAt: '2026-06-13T12:00:00.000Z', docCount: 4 },
      { ref: 'stable', lastBuiltAt: '2026-06-10T12:00:00.000Z', docCount: 3 }
    ],
    ...over
  } as Project
}

function propsWith(projects: Project[], over: Partial<ManageProjectsProps> = {}): ManageProjectsProps {
  return {
    projects,
    onRename: () => {},
    onSetTheme: () => {},
    onSetDocsSubpath: async () => ({ docCount: 1 }),
    onDelete: () => {},
    onSelect: () => {},
    onAddProject: () => {},
    onDone: () => {},
    ...over
  }
}

async function renderManage(props: ManageProjectsProps): Promise<void> {
  stubApi()
  await act(async () => {
    root.render(createElement(ManageProjects, props))
  })
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    ;(el as HTMLElement).click()
  })
}

function rowIds(): string[] {
  return Array.from(container.querySelectorAll('[data-row]')).map((row) => row.getAttribute('data-row') ?? '')
}

describe('ManageProjects', () => {
  it('renders a slim row per project: name, source, chip, doc count, edit + delete icons', async () => {
    await renderManage(propsWith([localProject(), githubProject()]))

    expect(container.querySelector('h2')?.textContent).toBe('Projects')

    const localRow = container.querySelector('[data-row="local-1"]') as HTMLElement
    const githubRow = container.querySelector('[data-row="github-1"]') as HTMLElement
    expect(localRow).toBeTruthy()
    expect(githubRow).toBeTruthy()

    // Doc count uses a uniform "N docs" label; GitHub uses the current ref's count (main = 4).
    expect(localRow.querySelector('.project-count')?.textContent).toBe('7 docs')
    expect(githubRow.querySelector('.project-count')?.textContent).toBe('4 docs')

    expect(localRow.querySelector('[data-chip]')?.textContent).toBe('local')
    expect(localRow.querySelector('[data-chip]')?.tagName).not.toBe('BUTTON')
    expect(githubRow.querySelector('[data-chip]')?.textContent).toBe('github')

    // Source is truncated but carries the full value in a title.
    expect(githubRow.querySelector('code')?.textContent).toContain('…')
    expect(githubRow.querySelector('code')?.getAttribute('title')).toBe(githubProject().source)

    // Each row exposes an edit and a delete control; no inline theme/subpath/rename.
    expect(localRow.querySelector('[data-action="edit"]')).toBeTruthy()
    expect(localRow.querySelector('[data-action="delete"]')).toBeTruthy()
    expect(localRow.querySelector('[data-role="theme-select"]')).toBeNull()
    expect(localRow.querySelector('[data-action="rename"]')).toBeNull()
    expect(container.querySelector('[data-role="filter"]')).toBeNull()
    expect(container.querySelector('[data-role="sort"]')).toBeNull()
  })

  it('falls back to 0 docs when the current GitHub ref is uncached', async () => {
    await renderManage(propsWith([githubProject({ currentRef: 'feature' })]))
    expect(container.querySelector('[data-row="github-1"] .project-count')?.textContent).toBe('0 docs')
  })

  it('calls onSelect from the project name button', async () => {
    const selected: string[] = []
    await renderManage(propsWith([localProject()], { onSelect: (id) => selected.push(id) }))

    await click(container.querySelector('[data-row="local-1"] [data-action="select"]')!)

    expect(selected).toEqual(['local-1'])
  })

  it('shows the first-run empty state and calls onAddProject', async () => {
    let addCount = 0
    await renderManage(propsWith([], { onAddProject: () => { addCount += 1 } }))

    const empty = container.querySelector('.empty-state') as HTMLElement
    expect(empty.textContent).toContain('No projects yet — add one to get started.')
    await click(empty.querySelector('[data-action="add-project"]')!)
    expect(addCount).toBe(1)
  })

  it('opens the edit modal for a project and closes it on cancel', async () => {
    await renderManage(propsWith([githubProject()]))

    expect(container.querySelector('.edit-project-modal')).toBeNull()
    await click(container.querySelector('[data-row="github-1"] [data-action="edit"]')!)

    const modal = container.querySelector('.edit-project-modal') as HTMLElement
    expect(modal).toBeTruthy()
    expect((modal.querySelector('[data-field="name"]') as HTMLInputElement).value).toBe('Repo Docs')
    expect(modal.querySelector('[data-role="theme-select"]')).toBeTruthy()
    expect((modal.querySelector('[data-field="docsSubpath"]') as HTMLInputElement).value).toBe('docs')

    await click(modal.querySelector('[data-action="cancel"]')!)
    expect(container.querySelector('.edit-project-modal')).toBeNull()
  })

  it('omits the docs subpath field for local projects', async () => {
    await renderManage(propsWith([localProject()]))

    await click(container.querySelector('[data-row="local-1"] [data-action="edit"]')!)
    const modal = container.querySelector('.edit-project-modal') as HTMLElement
    expect(modal.querySelector('[data-field="docsSubpath"]')).toBeNull()
  })

  it('deletes only after inline icon confirmation', async () => {
    const deleted: string[] = []
    await renderManage(propsWith([localProject()], { onDelete: (id) => deleted.push(id) }))

    await click(container.querySelector('[data-row="local-1"] [data-action="delete"]')!)
    const row = container.querySelector('[data-row="local-1"]') as HTMLElement
    expect(row.textContent).toContain('Delete?')
    expect(row.querySelector('[data-action="cancel-delete"]')).toBeTruthy()

    await click(row.querySelector('[data-action="cancel-delete"]')!)
    expect(deleted).toEqual([])
    expect(container.querySelector('[data-row="local-1"] [data-action="edit"]')).toBeTruthy()

    await click(container.querySelector('[data-row="local-1"] [data-action="delete"]')!)
    await click(container.querySelector('[data-row="local-1"] [data-action="confirm-delete"]')!)
    expect(deleted).toEqual(['local-1'])
  })

  it('disables row controls while building and shows streamed progress text', async () => {
    await renderManage(propsWith([githubProject({ status: 'building' })]))

    const row = container.querySelector('[data-row="github-1"]') as HTMLElement
    expect((row.querySelector('[data-action="select"]') as HTMLButtonElement).disabled).toBe(true)
    expect((row.querySelector('[data-action="edit"]') as HTMLButtonElement).disabled).toBe(true)
    expect((row.querySelector('[data-action="delete"]') as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      progressListener?.({
        projectId: 'github-1',
        ref: 'main',
        stage: 'parsing',
        message: 'Parsing streamed docs',
        docCount: 2
      })
    })

    expect(row.textContent).toContain('Parsing streamed docs')
  })

  it('sorts projects alphabetically by name', async () => {
    const projects = [
      githubProject({ id: 'github-1', name: 'Bravo Repo' }),
      localProject({ id: 'local-2', name: 'Zulu Local' }),
      localProject({ id: 'local-1', name: 'Alpha Local' })
    ]
    await renderManage(propsWith(projects))

    expect(rowIds()).toEqual(['local-1', 'github-1', 'local-2'])
  })

  it('calls onDone from the Done button', async () => {
    let doneCount = 0
    await renderManage(propsWith([localProject()], { onDone: () => { doneCount += 1 } }))

    await click(container.querySelector('[data-action="done"]')!)

    expect(doneCount).toBe(1)
  })
})
