import { describe, it, expect, beforeEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import TopBar from '../src/renderer/src/components/TopBar'
import type { Project } from '../src/shared/types'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'alpha',
    type: 'local',
    name: 'Alpha',
    source: '/tmp/alpha',
    addedAt: '2026-06-01T10:00:00.000Z',
    status: 'ok',
    lastBuiltAt: '2026-06-12T12:00:00.000Z',
    docCount: 2,
    ...over
  } as Project
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    ;(el as HTMLElement).click()
  })
}

describe('TopBar manage toggle', () => {
  it('renders a Manage projects toggle button that calls its handler', async () => {
    const calls: string[] = []
    const alpha = project()

    await act(async () => {
      root.render(createElement(TopBar, {
        projects: [alpha],
        activeId: alpha.id,
        activeProject: alpha,
        docTitle: null,
        toc: [],
        manageActive: false,
        onToggleManage: () => calls.push('toggle'),
        onSelectProject: () => {},
        onOpenAdd: () => {},
        onRebuild: () => {},
        onJumpTo: () => {},
        onOpenSettings: () => {}
      }))
    })

    const button = container.querySelector('[data-action="toggle-manage"]') as HTMLButtonElement | null
    expect(button).toBeTruthy()
    expect(button?.getAttribute('aria-label')).toBe('Manage projects')

    await click(button!)

    expect(calls).toEqual(['toggle'])
  })
})
