import { describe, it, expect, beforeEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import type { NavNode, Project } from '../src/shared/types'

let container: HTMLDivElement
let root: Root
let projects: Project[]

const alphaTree: NavNode[] = [
  { type: 'doc', name: 'README.md', title: 'Alpha Readme', path: 'README.md', kind: 'md' }
]

function localProject(over: Partial<Project> = {}): Project {
  return {
    id: 'alpha',
    type: 'local',
    name: 'Alpha',
    source: '/tmp/alpha',
    addedAt: '2026-06-01T10:00:00.000Z',
    status: 'ok',
    lastBuiltAt: '2026-06-12T12:00:00.000Z',
    docCount: 1,
    ...over
  } as Project
}

beforeEach(() => {
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  projects = [
    localProject(),
    localProject({ id: 'beta', name: 'Beta', source: '/tmp/beta' })
  ]

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
  })

  ;(window as unknown as { api: Window['api'] }).api = {
    listProjects: async () => projects,
    addLocalProject: async () => localProject({ id: 'new' }),
    addGithubProject: async () => localProject({ id: 'github', type: 'github' }),
    removeProject: async (id: string) => {
      projects = projects.filter((project) => project.id !== id)
    },
    updateProjectSettings: async (id, patch) => {
      const project = projects.find((candidate) => candidate.id === id)
      if (!project) throw new Error(`Unknown project ${id}`)
      Object.assign(project, patch)
      return project
    },
    rebuildProject: async () => {},
    setDocsSubpath: async () => ({ tree: alphaTree, docCount: 1 }),
    cancelBuild: async () => {},
    listRefs: async () => [],
    switchRef: async () => ({ tree: alphaTree, docCount: 1 }),
    addRef: async () => ({ tree: alphaTree, docCount: 1 }),
    removeRef: async () => {},
    selectProject: async () => ({ tree: alphaTree, docCount: 1 }),
    getDoc: async () => ({ kind: 'md', content: '# Alpha' }),
    search: async () => [],
    pickDirectory: async () => null,
    openPath: async () => {},
    onBuildProgress: () => () => {}
  }
})

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function renderApp(): Promise<void> {
  await act(async () => {
    root.render(createElement(App))
  })
  await settle()
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    ;(el as HTMLElement).click()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function requireElement(selector: string): Element {
  const el = container.querySelector(selector)
  expect(el).toBeTruthy()
  return el!
}

describe('App delete active project from manage view', () => {
  it('clears active project state after deleting the selected project', async () => {
    await renderApp()

    await click(requireElement('[data-action="toggle-manage"]'))
    await click(requireElement('[data-row="alpha"] [data-action="select"]'))

    expect(container.querySelector('.sidebar')).toBeTruthy()

    await click(requireElement('[data-action="toggle-manage"]'))
    await click(requireElement('[data-row="alpha"] [data-action="delete"]'))
    await click(requireElement('[data-row="alpha"] [data-action="confirm-delete"]'))

    expect(container.querySelector('.manage-projects')).toBeTruthy()
    expect(container.querySelector('.sidebar')).toBeNull()

    await click(requireElement('[data-action="done"]'))

    expect(container.querySelector('.sidebar')).toBeNull()
    expect(container.textContent).toContain('Add or select a project to begin.')
  })
})
