import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import type { Project, NavNode, IndexChanged } from '../src/shared/types'
import { stubLocalStorage } from './helpers/localStorage'

let container: HTMLDivElement
let root: Root
let restoreLs: () => void
let indexCb: ((payload: IndexChanged) => void) | null = null

const A: Project = { id: 'a', name: 'Alpha', type: 'local', source: '/tmp/a', addedAt: 'now', status: 'ok', docCount: 1 }
const treeWith: NavNode[] = [{ type: 'doc', name: 'r.md', title: 'R', path: 'r.md', kind: 'md' }]
const treeWithout: NavNode[] = [{ type: 'doc', name: 's.md', title: 'S', path: 's.md', kind: 'md' }]

beforeEach(() => {
  indexCb = null
  if (!window.matchMedia) {
    ;(window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    })
  }
  restoreLs = stubLocalStorage()
  ;(window as unknown as { api: Partial<Window['api']> }).api = {
    listProjects: async () => [A],
    selectProject: async () => ({ tree: treeWith, docCount: 1 }),
    getDoc: async () => ({ kind: 'md', content: '# R' }),
    onBuildProgress: () => () => {},
    onIndexChanged: (cb) => {
      indexCb = cb
      return () => {}
    }
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => { restoreLs() })

async function mountAndOpen(): Promise<void> {
  await act(async () => { root.render(createElement(App)) })
  await act(async () => {})
  const select = container.querySelector('.topbar-select') as HTMLSelectElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select, 'a')
    select.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
  await act(async () => {})
  await act(async () => { (container.querySelector('.tree-item') as HTMLButtonElement).click() })
  await act(async () => {})
}

describe('App index:changed handling', () => {
  it('updates the tree when the open doc is still present (stays open)', async () => {
    await mountAndOpen()
    await act(async () => { indexCb!({ projectId: 'a', tree: treeWith, docCount: 1 }) })
    expect(container.querySelector('.tree-item')).toBeTruthy()
    expect(container.textContent).not.toContain('This document was removed.')
  })

  it('shows "This document was removed." when the open doc disappears', async () => {
    await mountAndOpen()
    await act(async () => { indexCb!({ projectId: 'a', tree: treeWithout, docCount: 1 }) })
    expect(container.textContent).toContain('This document was removed.')
  })

  it('ignores a push for a non-active project', async () => {
    await mountAndOpen()
    await act(async () => { indexCb!({ projectId: 'other', tree: treeWithout, docCount: 0 }) })
    expect(container.textContent).not.toContain('This document was removed.')
  })
})
