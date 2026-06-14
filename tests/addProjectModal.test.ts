import { describe, it, expect, beforeEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import AddProjectModal from '../src/renderer/src/components/AddProjectModal'
import type { Project } from '../src/shared/types'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

function stubApi(over: Partial<Window['api']> = {}): void {
  ;(window as unknown as { api: Partial<Window['api']> }).api = {
    pickDirectory: async () => '/tmp/dir',
    addLocalProject: async () => ({ id: 'l1' }) as Project,
    addGithubProject: async () => ({ id: 'g1' }) as Project,
    cancelBuild: async () => {},
    onBuildProgress: () => () => {},
    ...over
  }
}

describe('AddProjectModal', () => {
  it('defaults to the GitHub tab input and validates empty source', async () => {
    stubApi()
    let added: Project | null = null
    await act(async () => {
      root.render(createElement(AddProjectModal, { onAdded: (p) => { added = p }, onClose: () => {} }))
    })
    const ghTab = container.querySelector('[data-tab="github"]') as HTMLButtonElement
    expect(ghTab).toBeTruthy()
    const submit = container.querySelector('[data-action="submit-github"]') as HTMLButtonElement
    await act(async () => { submit.click() })
    // No source typed → addGithubProject not called, project not added.
    expect(added).toBeNull()
  })

  it('adds a github project with the typed source', async () => {
    let calledWith = ''
    stubApi({
      addGithubProject: async (source: string) => { calledWith = source; return { id: 'g1' } as Project }
    })
    let added: Project | null = null
    await act(async () => {
      root.render(createElement(AddProjectModal, { onAdded: (p) => { added = p }, onClose: () => {} }))
    })
    const input = container.querySelector('[data-field="source"]') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'octocat/Hello-World')
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    const submit = container.querySelector('[data-action="submit-github"]') as HTMLButtonElement
    await act(async () => { submit.click() })
    expect(calledWith).toBe('octocat/Hello-World')
    expect((added as Project | null)?.id).toBe('g1')
  })
})
