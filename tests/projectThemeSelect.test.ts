import { describe, it, expect, beforeEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import EditProjectModal, { type EditProjectModalProps } from '../src/renderer/src/components/EditProjectModal'
import { THEME_LIST } from '../src/renderer/src/lib/theme'
import type { Project } from '../src/shared/types'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

const project: Project = {
  id: 'p1',
  type: 'local',
  name: 'Alpha',
  source: '/tmp/a',
  addedAt: 'now',
  status: 'ok',
  docCount: 3
} as Project

function props(over: Partial<EditProjectModalProps> = {}): EditProjectModalProps {
  return {
    project,
    onRename: () => {},
    onSetTheme: () => {},
    onSetDocsSubpath: async () => ({ docCount: 1 }),
    onClose: () => {},
    ...over
  }
}

async function render(p: EditProjectModalProps): Promise<void> {
  await act(async () => {
    root.render(createElement(EditProjectModal, p))
  })
}

const select = (): HTMLSelectElement => container.querySelector('[data-role="theme-select"]') as HTMLSelectElement

async function setSelect(v: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select(), v)
    select().dispatchEvent(new window.Event('change', { bubbles: true }))
  })
}

describe('EditProjectModal per-project theme control', () => {
  it('lists Use global + every built-in theme by name', async () => {
    await render(props())
    const labels = Array.from(select().querySelectorAll('option')).map((o) => o.textContent)
    expect(labels).toEqual(['Use global', ...THEME_LIST.map((t) => t.name)])
  })

  it('labels the field "Theme"', async () => {
    await render(props())
    const field = select().closest('.field') as HTMLElement
    expect(field.querySelector('span')?.textContent).toBe('Theme')
  })

  it('seeds an unknown legacy themeId as Use global', async () => {
    await render(props({ project: { ...project, themeId: 'dark' } as Project }))
    expect(select().value).toBe('')
  })

  it('commits a chosen theme via onSetTheme on Save', async () => {
    const calls: Array<[string, string | undefined]> = []
    await render(props({ onSetTheme: (id, t) => calls.push([id, t]) }))
    await setSelect('graphite')
    await act(async () => {
      (container.querySelector('[data-action="save"]') as HTMLButtonElement).click()
    })
    expect(calls).toEqual([['p1', 'graphite']])
  })

  it('commits undefined when Use global is chosen', async () => {
    const calls: Array<[string, string | undefined]> = []
    await render(props({
      project: { ...project, themeId: 'graphite' } as Project,
      onSetTheme: (id, t) => calls.push([id, t])
    }))
    await setSelect('')
    await act(async () => {
      (container.querySelector('[data-action="save"]') as HTMLButtonElement).click()
    })
    expect(calls).toEqual([['p1', undefined]])
  })

  it('renders a swatch chip that repaints when the selection changes', async () => {
    await render(props())
    const chip = (): HTMLElement => container.querySelector('[data-theme-chip]') as HTMLElement
    expect(chip()).toBeTruthy()
    const before = chip().getAttribute('data-chip-theme')
    await setSelect('sepia')
    expect(chip().getAttribute('data-chip-theme')).toBe('sepia')
    expect(chip().getAttribute('data-chip-theme')).not.toBe(before)
  })
})
