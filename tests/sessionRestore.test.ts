import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import type { Project, NavNode } from '../src/shared/types'
import { stubLocalStorage as installLocalStorage } from './helpers/localStorage'

let container: HTMLDivElement
let root: Root

const A: Project = { id: 'a', name: 'Alpha', type: 'local', source: '/tmp/a', addedAt: 'now', status: 'ok', docCount: 1 }
const tree: NavNode[] = [{ type: 'doc', name: 'r.md', title: 'R', path: 'r.md', kind: 'md' }]

let restoreLs: () => void = () => {}
function stubLocalStorage(seed?: unknown): void {
  restoreLs()
  restoreLs = installLocalStorage(seed)
}
afterEach(() => {
  restoreLs()
  restoreLs = () => {}
})

function stubApi(projects: Project[], over: Partial<Window['api']> = {}): void {
  ;(window as unknown as { api: Partial<Window['api']> }).api = {
    listProjects: async () => projects,
    selectProject: async () => ({ tree, docCount: 1 }),
    getDoc: async () => ({ kind: 'md', content: '# R\n\n## Setup\n\nbody' }),
    onBuildProgress: () => () => {},
    onIndexChanged: () => () => {},
    ...over
  }
}

beforeEach(() => {
  if (!window.matchMedia) {
    ;(window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

async function mount(): Promise<void> {
  await act(async () => { root.render(createElement(App)) })
  await act(async () => {})
  await act(async () => {})
}

describe('App session restore', () => {
  it('happy path: restores the project and its doc, scrolled to the saved anchor', async () => {
    stubLocalStorage({ lastProjectId: 'a', perProject: { a: { docPath: 'r.md', headingId: 'setup' } } })
    stubApi([A])
    await mount()
    expect(container.querySelector('.sidebar')).toBeTruthy()
    expect(container.querySelector('.tree-item.active')).toBeTruthy()
    expect(container.textContent).not.toContain('Select a document.')
  })

  it('project missing/unavailable: falls back to the home empty-state', async () => {
    stubLocalStorage({ lastProjectId: 'gone', perProject: {} })
    stubApi([A])
    await mount()
    expect(container.querySelector('.sidebar')).toBeNull()
    expect(container.textContent).toContain('Add or select a project to begin.')
  })

  it('doc no longer in tree: selects the project but shows "Select a document."', async () => {
    stubLocalStorage({ lastProjectId: 'a', perProject: { a: { docPath: 'gone.md' } } })
    stubApi([A])
    await mount()
    expect(container.querySelector('.sidebar')).toBeTruthy()
    expect(container.textContent).toContain('Select a document.')
  })

  it('first run (no session): home empty-state, nothing restored', async () => {
    stubLocalStorage(undefined)
    stubApi([A])
    await mount()
    expect(container.querySelector('.sidebar')).toBeNull()
    expect(container.textContent).toContain('Add or select a project to begin.')
  })

  it('best-effort anchor: a missing heading id still opens the doc without throwing', async () => {
    stubLocalStorage({ lastProjectId: 'a', perProject: { a: { docPath: 'r.md', headingId: 'nope' } } })
    stubApi([A])
    await mount()
    expect(container.querySelector('.tree-item.active')).toBeTruthy()
  })
})
