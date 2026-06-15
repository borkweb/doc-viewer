import { describe, it, expect, beforeEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import EditProjectModal, {
  type EditProjectModalProps
} from '../src/renderer/src/components/EditProjectModal'
import type { Project } from '../src/shared/types'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

function localProject(over: Partial<Project> = {}): Project {
  return {
    id: 'local-1',
    type: 'local',
    name: 'Local Alpha',
    source: '/tmp/local',
    addedAt: '2026-06-01T10:00:00.000Z',
    status: 'ok',
    docCount: 7,
    ...over
  } as Project
}

function githubProject(over: Partial<Project> = {}): Project {
  return {
    id: 'github-1',
    type: 'github',
    name: 'Repo Docs',
    source: 'https://github.com/example/repo',
    addedAt: '2026-06-02T10:00:00.000Z',
    status: 'ok',
    docsSubpath: 'docs',
    currentRef: 'main',
    refs: [{ ref: 'main', lastBuiltAt: '2026-06-13T12:00:00.000Z', docCount: 4 }],
    ...over
  } as Project
}

function propsWith(project: Project, over: Partial<EditProjectModalProps> = {}): EditProjectModalProps {
  return {
    project,
    onRename: () => {},
    onSetTheme: () => {},
    onSetDocsSubpath: async () => ({ docCount: 1 }),
    onClose: () => {},
    ...over
  }
}

async function renderModal(props: EditProjectModalProps): Promise<void> {
  await act(async () => {
    root.render(createElement(EditProjectModal, props))
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

const $name = (): HTMLInputElement => container.querySelector('[data-field="name"]') as HTMLInputElement
const $theme = (): HTMLSelectElement => container.querySelector('[data-role="theme-select"]') as HTMLSelectElement
const $subpath = (): HTMLInputElement => container.querySelector('[data-field="docsSubpath"]') as HTMLInputElement
const $save = (): HTMLButtonElement => container.querySelector('[data-action="save"]') as HTMLButtonElement

describe('EditProjectModal', () => {
  it('seeds fields from the project and maps an absent theme to Use global', async () => {
    await renderModal(propsWith(githubProject({ themeId: undefined })))
    expect($name().value).toBe('Repo Docs')
    expect($theme().value).toBe('')
    expect($subpath().value).toBe('docs')
  })

  it('commits a trimmed rename and closes when only the name changed', async () => {
    const renames: Array<[string, string]> = []
    let closed = 0
    await renderModal(
      propsWith(localProject(), {
        onRename: (id, name) => renames.push([id, name]),
        onClose: () => { closed += 1 }
      })
    )

    await setInput($name(), '  Renamed Docs  ')
    await click($save())

    expect(renames).toEqual([['local-1', 'Renamed Docs']])
    expect(closed).toBe(1)
  })

  it('does not emit a rename or theme update when nothing changed', async () => {
    const renames: string[] = []
    const themes: Array<string | undefined> = []
    let closed = 0
    await renderModal(
      propsWith(localProject({ themeId: 'sepia' }), {
        onRename: (id) => renames.push(id),
        onSetTheme: (_id, theme) => themes.push(theme),
        onClose: () => { closed += 1 }
      })
    )

    await click($save())

    expect(renames).toEqual([])
    expect(themes).toEqual([])
    expect(closed).toBe(1)
  })

  it('maps the Use global theme option to an undefined project theme', async () => {
    const themes: Array<[string, string | undefined]> = []
    await renderModal(
      propsWith(localProject({ themeId: 'dark' }), {
        onSetTheme: (id, theme) => themes.push([id, theme])
      })
    )

    await setSelect($theme(), '')
    await click($save())

    expect(themes).toEqual([['local-1', undefined]])
  })

  it('emits undefined on Save for a legacy themeId seed (migration on save)', async () => {
    const calls: Array<[string, string | undefined]> = []
    await renderModal(
      propsWith(localProject({ themeId: 'dark' }), {
        onSetTheme: (id, theme) => calls.push([id, theme])
      })
    )

    expect($theme().value).toBe('')
    await click($save())

    expect(calls).toEqual([['local-1', undefined]])
  })

  it('rebuilds on a changed docs subpath and closes on success', async () => {
    const subpaths: Array<[string, string]> = []
    let closed = 0
    await renderModal(
      propsWith(githubProject(), {
        onSetDocsSubpath: async (id, subpath) => {
          subpaths.push([id, subpath])
          return { docCount: 3 }
        },
        onClose: () => { closed += 1 }
      })
    )

    await setInput($subpath(), '  guides  ')
    await click($save())

    expect(subpaths).toEqual([['github-1', 'guides']])
    expect(closed).toBe(1)
  })

  it('keeps the modal open with a note when the subpath rebuild finds no docs', async () => {
    let closed = 0
    await renderModal(
      propsWith(githubProject(), {
        onSetDocsSubpath: async () => ({ docCount: 0 }),
        onClose: () => { closed += 1 }
      })
    )

    await setInput($subpath(), 'empty')
    await click($save())

    expect(container.textContent).toContain('No docs found at that subpath.')
    expect(closed).toBe(0)
    expect(container.querySelector('.edit-project-modal')).toBeTruthy()
  })

  it('shows distinct collision and generic subpath errors and stays open', async () => {
    let closed = 0
    await renderModal(
      propsWith(githubProject(), {
        onSetDocsSubpath: async (_id, subpath) => {
          if (subpath === 'taken') {
            const err = new Error('duplicate') as Error & { code?: string }
            err.code = 'collision'
            throw err
          }
          throw new Error('network failed')
        },
        onClose: () => { closed += 1 }
      })
    )

    await setInput($subpath(), 'taken')
    await click($save())
    expect(container.textContent).toContain('Another project already uses that repo + subpath.')

    await setInput($subpath(), 'api')
    await click($save())
    expect(container.textContent).toContain("Couldn't rebuild at that subpath.")
    expect(closed).toBe(0)
  })

  it('calls onClose from Cancel without applying changes', async () => {
    const renames: string[] = []
    let closed = 0
    await renderModal(
      propsWith(localProject(), {
        onRename: (id) => renames.push(id),
        onClose: () => { closed += 1 }
      })
    )

    await setInput($name(), 'Discarded')
    await click(container.querySelector('[data-action="cancel"]')!)

    expect(renames).toEqual([])
    expect(closed).toBe(1)
  })
})
