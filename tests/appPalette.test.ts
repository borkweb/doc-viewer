import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/renderer/src/App'
import type { Project, NavNode } from '../src/shared/types'
import { stubLocalStorage } from './helpers/localStorage'

let container: HTMLDivElement
let root: Root
let restoreLs: () => void
const A: Project = { id: 'a', name: 'Alpha', type: 'local', source: '/tmp/a', addedAt: 'now', status: 'ok', docCount: 1 }
const docTree: NavNode[] = [{ type: 'doc', name: 'r.md', title: 'Readme', path: 'r.md', kind: 'md' }]

beforeEach(() => {
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
    selectProject: async () => ({ tree: [], docCount: 0 }),
    getDoc: async () => ({ kind: 'md', content: '# Readme' }),
    onBuildProgress: () => () => {},
    onIndexChanged: () => () => {}
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => { restoreLs() })

async function mount(): Promise<void> {
  await act(async () => { root.render(createElement(App)) })
  await act(async () => {})
}

const palette = (): Element | null => container.querySelector('[data-palette]')

function key(k: string, init: Partial<KeyboardEventInit> = {}): void {
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, ...init }))
}

const search = (): HTMLInputElement => container.querySelector('[data-field="palette-search"]') as HTMLInputElement

function setValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

describe('App command palette keybinding', () => {
  it('opens on Ctrl+K and toggles closed on a second Ctrl+K', async () => {
    await mount()
    expect(palette()).toBeNull()
    await act(async () => { key('k', { ctrlKey: true }) })
    expect(palette()).toBeTruthy()
    await act(async () => { key('k', { ctrlKey: true }) })
    expect(palette()).toBeNull()
  })

  it('opens on Meta+K and closes on Escape', async () => {
    await mount()
    await act(async () => { key('k', { metaKey: true }) })
    expect(palette()).toBeTruthy()
    await act(async () => {
      search().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(palette()).toBeNull()
  })

  it('is suppressed while a modal (Settings) is open', async () => {
    await mount()
    await act(async () => { (container.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click() })
    await act(async () => { key('k', { ctrlKey: true }) })
    expect(palette()).toBeNull()
  })

  it('activating a Document result while in the Manage view switches back to the docs view (MF4)', async () => {
    ;(window as unknown as { api: Partial<Window['api']> }).api.selectProject = async () => ({ tree: docTree, docCount: 1 })
    await mount()
    const projectSelect = container.querySelector('.topbar-select') as HTMLSelectElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
      setter.call(projectSelect, 'a')
      projectSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
    })
    await act(async () => {})

    await act(async () => { key('k', { metaKey: true }) })
    const manageCmd = Array.from(container.querySelectorAll('[data-option][data-kind="command"]'))
      .find((option) => option.textContent?.includes('Manage projects')) as HTMLElement
    await act(async () => { manageCmd.click() })
    expect(container.querySelector('.sidebar')).toBeNull()

    await act(async () => { key('k', { metaKey: true }) })
    await act(async () => { setValue(search(), 'readme') })
    await act(async () => {
      search().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await act(async () => {})
    expect(container.querySelector('.sidebar')).toBeTruthy()
  })
})
