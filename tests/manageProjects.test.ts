import { describe, it, expect, beforeEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ManageProjects, { type ManageProjectsProps } from '../src/renderer/src/components/ManageProjects'
import type { BuildProgress, Project, ThemeChoice } from '../src/shared/types'

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

async function setInput(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

async function setSelect(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select, value)
    select.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    ;(el as HTMLElement).click()
  })
}

async function key(input: HTMLInputElement, keyName: string): Promise<void> {
  await act(async () => {
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: keyName, bubbles: true }))
  })
}

async function blur(input: HTMLInputElement): Promise<void> {
  await act(async () => {
    input.dispatchEvent(new window.Event('focusout', { bubbles: true }))
  })
}

function rowIds(): string[] {
  return Array.from(container.querySelectorAll('[data-row]')).map((row) => row.getAttribute('data-row') ?? '')
}

describe('ManageProjects', () => {
  it('renders project rows with chips, counts, controls, and truncated sources', async () => {
    await renderManage(propsWith([localProject(), githubProject()]))

    expect(container.querySelector('h2')?.textContent).toBe('Manage Projects')
    expect((container.querySelector('[data-role="filter"]') as HTMLInputElement).placeholder).toBe('Filter projects…')

    const sort = container.querySelector('[data-role="sort"]') as HTMLSelectElement
    expect(Array.from(sort.options).map((option) => option.textContent)).toEqual([
      'Sort: Name',
      'Sort: Type',
      'Sort: Recently built'
    ])

    const localRow = container.querySelector('[data-row="local-1"]') as HTMLElement
    const githubRow = container.querySelector('[data-row="github-1"]') as HTMLElement
    expect(localRow).toBeTruthy()
    expect(githubRow).toBeTruthy()
    expect(localRow.querySelector('[data-chip]')?.textContent).toBe('local')
    expect(localRow.querySelector('[data-chip]')?.tagName).not.toBe('BUTTON')
    expect(localRow.textContent).toContain('7 docs')
    expect(githubRow.querySelector('[data-chip]')?.textContent).toBe('github')
    expect(githubRow.textContent).toContain('2 branches')
    expect(githubRow.querySelector('code')?.textContent).toContain('…')
    expect(githubRow.querySelector('code')?.getAttribute('title')).toBe(githubProject().source)
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

  it('commits a trimmed rename on Enter', async () => {
    const renames: Array<[string, string]> = []
    await renderManage(propsWith([localProject()], { onRename: (id, name) => renames.push([id, name]) }))

    await click(container.querySelector('[data-row="local-1"] [data-action="rename"]')!)
    const input = container.querySelector('[data-row="local-1"] [data-field="rename"]') as HTMLInputElement
    await setInput(input, '  Renamed Docs  ')
    await key(input, 'Enter')

    expect(renames).toEqual([['local-1', 'Renamed Docs']])
  })

  it('falls back to the prior name on blank rename without sending an empty update', async () => {
    const renames: Array<[string, string]> = []
    await renderManage(propsWith([localProject()], { onRename: (id, name) => renames.push([id, name]) }))

    await click(container.querySelector('[data-row="local-1"] [data-action="rename"]')!)
    const input = container.querySelector('[data-row="local-1"] [data-field="rename"]') as HTMLInputElement
    await setInput(input, '    ')
    await blur(input)

    expect(renames).toEqual([])
    expect(container.querySelector('[data-row="local-1"]')?.textContent).toContain('Local Alpha')
  })

  it('cancels rename on Escape', async () => {
    const renames: Array<[string, string]> = []
    await renderManage(propsWith([localProject()], { onRename: (id, name) => renames.push([id, name]) }))

    await click(container.querySelector('[data-row="local-1"] [data-action="rename"]')!)
    const input = container.querySelector('[data-row="local-1"] [data-field="rename"]') as HTMLInputElement
    await setInput(input, 'Ignored')
    await key(input, 'Escape')

    expect(renames).toEqual([])
    expect(container.querySelector('[data-row="local-1"] [data-field="rename"]')).toBeNull()
  })

  it('maps the Global theme option to an undefined project theme', async () => {
    const themes: Array<[string, ThemeChoice | undefined]> = []
    await renderManage(propsWith([localProject({ themeId: 'dark' })], {
      onSetTheme: (id, theme) => themes.push([id, theme])
    }))

    await setSelect(container.querySelector('[data-row="local-1"] [data-role="theme-select"]') as HTMLSelectElement, '')

    expect(themes).toEqual([['local-1', undefined]])
  })

  it('deletes only after inline confirmation', async () => {
    const deleted: string[] = []
    await renderManage(propsWith([localProject()], { onDelete: (id) => deleted.push(id) }))

    await click(container.querySelector('[data-row="local-1"] [data-action="delete"]')!)
    expect(container.querySelector('[data-row="local-1"]')?.textContent).toContain('Delete Local Alpha?')
    const cancel = container.querySelector('[data-row="local-1"] [data-action="cancel-delete"]') as HTMLButtonElement
    const confirm = container.querySelector('[data-row="local-1"] [data-action="confirm-delete"]') as HTMLButtonElement
    expect(cancel.textContent).toBe('Cancel')
    expect(confirm.textContent).toBe('Delete')
    await click(cancel)
    expect(deleted).toEqual([])
    await click(container.querySelector('[data-row="local-1"] [data-action="delete"]')!)
    await click(container.querySelector('[data-row="local-1"] [data-action="confirm-delete"]')!)

    expect(deleted).toEqual(['local-1'])
  })

  it('edits a GitHub docs subpath, keeps the field open while busy, and shows the zero-doc note', async () => {
    const subpaths: Array<[string, string]> = []
    let resolveSubpath!: (value: { docCount: number }) => void
    const pending = new Promise<{ docCount: number }>((resolve) => {
      resolveSubpath = resolve
    })
    await renderManage(propsWith([githubProject()], {
      onSetDocsSubpath: async (id, subpath) => {
        subpaths.push([id, subpath])
        return pending
      }
    }))

    await click(container.querySelector('[data-row="github-1"] [data-action="edit-subpath"]')!)
    const input = container.querySelector('[data-row="github-1"] [data-field="docsSubpath"]') as HTMLInputElement
    expect(input.placeholder).toBe('docs subpath (e.g. docs)')
    await setInput(input, '  guides  ')
    await click(container.querySelector('[data-row="github-1"] [data-action="commit-subpath"]')!)

    expect(subpaths).toEqual([['github-1', 'guides']])
    expect((container.querySelector('[data-row="github-1"] [data-action="rename"]') as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      resolveSubpath({ docCount: 0 })
      await pending
    })

    expect(container.querySelector('[data-row="github-1"]')?.textContent).toContain('No docs found at that subpath.')
    expect(container.querySelector('[data-row="github-1"] [data-field="docsSubpath"]')).toBeNull()
  })

  it('does not render docs subpath controls for local projects', async () => {
    await renderManage(propsWith([localProject()]))

    expect(container.querySelector('[data-row="local-1"] [data-action="edit-subpath"]')).toBeNull()
    expect(container.querySelector('[data-row="local-1"] [data-field="docsSubpath"]')).toBeNull()
  })

  it('shows distinct collision and generic docs subpath errors', async () => {
    await renderManage(propsWith([githubProject()], {
      onSetDocsSubpath: async (_id, subpath) => {
        if (subpath === 'docs') {
          const err = new Error('duplicate')
          ;(err as Error & { code?: string }).code = 'collision'
          throw err
        }
        throw new Error('network failed')
      }
    }))

    await click(container.querySelector('[data-row="github-1"] [data-action="edit-subpath"]')!)
    const input = container.querySelector('[data-row="github-1"] [data-field="docsSubpath"]') as HTMLInputElement
    await setInput(input, 'docs')
    await click(container.querySelector('[data-row="github-1"] [data-action="commit-subpath"]')!)
    expect(container.querySelector('[data-row="github-1"]')?.textContent).toContain('Another project already uses that repo + subpath.')
    expect(container.querySelector('[data-row="github-1"] [data-field="docsSubpath"]')).toBeTruthy()

    await setInput(input, 'api')
    await click(container.querySelector('[data-row="github-1"] [data-action="commit-subpath"]')!)
    expect(container.querySelector('[data-row="github-1"]')?.textContent).toContain("Couldn't rebuild at that subpath.")
    expect(container.querySelector('[data-row="github-1"] [data-field="docsSubpath"]')).toBeTruthy()
  })

  it('disables row controls while building and shows streamed progress text', async () => {
    await renderManage(propsWith([githubProject({ status: 'building' })]))

    const row = container.querySelector('[data-row="github-1"]') as HTMLElement
    expect((row.querySelector('[data-action="select"]') as HTMLButtonElement).disabled).toBe(true)
    expect((row.querySelector('[data-action="rename"]') as HTMLButtonElement).disabled).toBe(true)
    expect((row.querySelector('[data-role="theme-select"]') as HTMLSelectElement).disabled).toBe(true)
    expect((row.querySelector('[data-action="edit-subpath"]') as HTMLButtonElement).disabled).toBe(true)
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

  it('filters projects case-insensitively and clears filtered-empty state', async () => {
    await renderManage(propsWith([localProject(), githubProject()]))

    await setInput(container.querySelector('[data-role="filter"]') as HTMLInputElement, 'repo')
    expect(rowIds()).toEqual(['github-1'])

    await setInput(container.querySelector('[data-role="filter"]') as HTMLInputElement, 'missing')
    expect(container.textContent).toContain('No projects match "missing".')
    await click(container.querySelector('[data-action="clear-filter"]')!)

    expect((container.querySelector('[data-role="filter"]') as HTMLInputElement).value).toBe('')
    expect(rowIds()).toEqual(['local-1', 'github-1'])
  })

  it('sorts by name by default, then type, then recently built', async () => {
    const projects = [
      githubProject({
        id: 'github-1',
        name: 'Bravo Repo',
        refs: [
          { ref: 'main', lastBuiltAt: '2026-06-14T12:00:00.000Z', docCount: 3 },
          { ref: 'old', lastBuiltAt: '2026-06-01T12:00:00.000Z', docCount: 1 }
        ]
      }),
      localProject({
        id: 'local-2',
        name: 'Zulu Local',
        lastBuiltAt: '2026-06-12T12:00:00.000Z'
      }),
      localProject({
        id: 'local-1',
        name: 'Alpha Local',
        lastBuiltAt: '2026-06-10T12:00:00.000Z'
      })
    ]
    await renderManage(propsWith(projects))

    expect(rowIds()).toEqual(['local-1', 'github-1', 'local-2'])

    await setSelect(container.querySelector('[data-role="sort"]') as HTMLSelectElement, 'type')
    expect(rowIds()).toEqual(['local-1', 'local-2', 'github-1'])

    await setSelect(container.querySelector('[data-role="sort"]') as HTMLSelectElement, 'recent')
    expect(rowIds()).toEqual(['github-1', 'local-2', 'local-1'])
  })

  it('calls onDone from the Done button', async () => {
    let doneCount = 0
    await renderManage(propsWith([localProject()], { onDone: () => { doneCount += 1 } }))

    await click(container.querySelector('[data-action="done"]')!)

    expect(doneCount).toBe(1)
  })
})
