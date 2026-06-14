import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import type { Project, NavNode } from '../src/shared/types'
import { stubLocalStorage as installLocalStorage } from './helpers/localStorage'

let container: HTMLDivElement
let root: Root
let scrolled: Element[]

const A: Project = { id: 'a', name: 'Alpha', type: 'local', source: '/tmp/a', addedAt: 'now', status: 'ok', docCount: 1 }
const tree: NavNode[] = [{ type: 'doc', name: 'r.md', title: 'R', path: 'r.md', kind: 'md' }]

let restoreLs: () => void = () => {}
let restoreScrollIntoView: () => void = () => {}
function stubLocalStorage(seed?: unknown): void {
  restoreLs()
  restoreLs = installLocalStorage(seed)
}
afterEach(() => {
  restoreLs()
  restoreLs = () => {}
  restoreScrollIntoView()
  restoreScrollIntoView = () => {}
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
  scrolled = []
  const priorScroll = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'scrollIntoView')
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: function scrollIntoView(this: Element): void {
      scrolled.push(this)
    }
  })
  restoreScrollIntoView = () => {
    if (priorScroll) Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', priorScroll)
    else delete (window.HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
  }
})

async function mount(): Promise<void> {
  await act(async () => { root.render(createElement(App)) })
  await act(async () => {})
  await act(async () => {})
}

async function selectAlpha(): Promise<void> {
  const select = container.querySelector('.topbar-select') as HTMLSelectElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select, 'a')
    select.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
  await act(async () => {})
}

function savedSession(): { lastProjectId?: string; perProject?: Record<string, { docPath?: string; headingId?: string }> } {
  return JSON.parse(localStorage.getItem('curator.session') ?? '{}')
}

describe('App session restore', () => {
  it('happy path: restores the project and its doc, scrolled to the saved anchor', async () => {
    stubLocalStorage({ lastProjectId: 'a', perProject: { a: { docPath: 'r.md', headingId: 'setup' } } })
    stubApi([A])
    await mount()
    expect(container.querySelector('.sidebar')).toBeTruthy()
    expect(container.querySelector('.tree-item.active')).toBeTruthy()
    expect(scrolled.map((el) => (el as HTMLElement).id)).toContain('setup')
    expect(container.textContent).not.toContain('Select a document.')
  })

  it('project missing/unavailable: falls back to the home empty-state', async () => {
    stubLocalStorage({ lastProjectId: 'gone', perProject: {} })
    stubApi([A])
    await mount()
    expect(container.querySelector('.sidebar')).toBeNull()
    expect(container.textContent).toContain('Add or select a project to begin.')
  })

  it('project unavailable: falls back home and does not select the project', async () => {
    stubLocalStorage({ lastProjectId: 'a', perProject: {} })
    let selected = 0
    stubApi([{ ...A, status: 'unavailable' }], {
      selectProject: async () => {
        selected += 1
        return { tree, docCount: 1 }
      }
    })
    await mount()
    expect(selected).toBe(0)
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

  it('captures last project, open doc, and nearest heading as the user navigates and scrolls', async () => {
    stubLocalStorage(undefined)
    stubApi([A])
    await mount()

    await selectAlpha()
    expect(savedSession().lastProjectId).toBe('a')

    await act(async () => { (container.querySelector('.tree-item') as HTMLButtonElement).click() })
    await act(async () => {})
    expect(savedSession().perProject?.a?.docPath).toBe('r.md')

    const main = container.querySelector('main.content') as HTMLElement
    await act(async () => {
      main.scrollTop = 1
      main.dispatchEvent(new window.Event('scroll', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 280))
    })
    expect(savedSession().perProject?.a?.headingId).toBe('setup')
  })
})
