import { describe, it, expect, beforeEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import CommandPalette, { type CommandPaletteProps } from '../src/renderer/src/components/CommandPalette'
import type { Project, NavNode } from '../src/shared/types'

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

const local: Project = { id: 'l1', name: 'Curator', type: 'local', source: '/c', addedAt: 'now', status: 'ok', docCount: 2 }
const gh: Project = {
  id: 'g1',
  name: 'design-system',
  type: 'github',
  source: 'https://github.com/o/r',
  refs: [{ ref: 'main', lastBuiltAt: 'now', docCount: 1 }],
  currentRef: 'main',
  addedAt: 'now',
  status: 'ok'
}
const tree: NavNode[] = [
  { type: 'doc', name: 'architecture.md', title: 'Architecture overview', path: 'docs/architecture.md', kind: 'md' },
  { type: 'doc', name: 'ipc.md', title: 'IPC channels', path: 'docs/ipc.md', kind: 'md' }
]

function setValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

function props(over: Partial<CommandPaletteProps> = {}): CommandPaletteProps {
  return {
    projects: [local, gh],
    activeId: 'l1',
    activeProject: local,
    tree,
    onSelectProject: () => {},
    onOpenDoc: () => {},
    onSwitchRef: () => {},
    onAddProject: () => {},
    onManageProjects: () => {},
    onRebuild: () => {},
    onSettings: () => {},
    onClose: () => {},
    ...over
  }
}

async function render(p: CommandPaletteProps): Promise<void> {
  await act(async () => { root.render(createElement(CommandPalette, p)) })
}

const input = (): HTMLInputElement => container.querySelector('[data-field="palette-search"]') as HTMLInputElement
const optKinds = (): string[] =>
  Array.from(container.querySelectorAll('[data-option]')).map((option) => option.getAttribute('data-kind') as string)

describe('CommandPalette', () => {
  it('empty query lists Projects + Commands only (no Documents) and the hint', async () => {
    await render(props())
    expect(optKinds()).not.toContain('doc')
    expect(optKinds()).toContain('project')
    expect(optKinds()).toContain('command')
    expect(container.querySelector('[data-hint]')?.textContent).toBe('Type to search documents...')
  })

  it('typing surfaces the Documents tier and narrows to a unique doc', async () => {
    await render(props())
    await act(async () => { setValue(input(), 'ipc') })
    const docs = Array.from(container.querySelectorAll('[data-option][data-kind="doc"]'))
    expect(docs.length).toBe(1)
    expect(docs[0].textContent).toContain('IPC channels')
    expect(container.querySelector('[data-hint]')).toBeNull()
  })

  it('shows the No matches. row for a non-matching query', async () => {
    await render(props())
    await act(async () => { setValue(input(), 'zzzqqq') })
    expect(container.querySelector('[data-empty]')?.textContent).toBe('No matches.')
  })

  it('activates a doc with Enter (after typing) and closes', async () => {
    let opened = ''
    let closed = false
    await render(props({ onOpenDoc: (path) => { opened = path }, onClose: () => { closed = true } }))
    await act(async () => { setValue(input(), 'architecture') })
    await act(async () => {
      input().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(opened).toBe('docs/architecture.md')
    expect(closed).toBe(true)
  })

  it('selects a project on click and closes', async () => {
    let picked = ''
    let closed = false
    await render(props({ onSelectProject: (id) => { picked = id }, onClose: () => { closed = true } }))
    const projOpt = container.querySelector('[data-option][data-kind="project"]') as HTMLElement
    await act(async () => { projOpt.click() })
    expect(picked).toBe('l1')
    expect(closed).toBe(true)
  })

  it('hides Documents/Reindex/Switch-ref commands when no project is active', async () => {
    await render(props({ activeId: null, activeProject: null }))
    const labels = Array.from(container.querySelectorAll('[data-option][data-kind="command"]'))
      .map((option) => option.textContent)
    expect(labels.some((label) => label?.includes('Add project'))).toBe(true)
    expect(labels.some((label) => label?.includes('Reindex') || label?.includes('Pull latest'))).toBe(false)
    expect(labels.some((label) => label?.includes('Switch ref'))).toBe(false)
    expect(container.querySelector('[data-hint]')).toBeNull()
  })

  it('shows Switch ref... for a github active project and fires onSwitchRef + close', async () => {
    let switched = false
    let closed = false
    await render(props({
      activeId: 'g1',
      activeProject: gh,
      onSwitchRef: () => { switched = true },
      onClose: () => { closed = true }
    }))
    const ref = Array.from(container.querySelectorAll('[data-option][data-kind="command"]'))
      .find((option) => option.textContent?.includes('Switch ref...')) as HTMLElement
    expect(ref).toBeTruthy()
    await act(async () => { ref.click() })
    expect(switched).toBe(true)
    expect(closed).toBe(true)
  })

  it('Escape closes the palette and stops propagation', async () => {
    let closed = false
    let leaked = false
    await render(props({ onClose: () => { closed = true } }))
    document.addEventListener('keydown', () => { leaked = true }, { once: true })
    await act(async () => {
      input().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(closed).toBe(true)
    expect(leaked).toBe(false)
  })

  it('traps Tab and Shift+Tab inside the palette', async () => {
    await render(props())
    const list = container.querySelector('[data-role="palette-list"]') as HTMLElement
    expect(document.activeElement).toBe(input())

    await act(async () => {
      input().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })
    expect(document.activeElement).toBe(list)

    await act(async () => {
      list.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    })
    expect(document.activeElement).toBe(input())
  })

  it('restores focus to the previously focused element on unmount', async () => {
    const before = document.createElement('button')
    before.textContent = 'Before'
    document.body.appendChild(before)
    before.focus()

    await render(props())
    expect(document.activeElement).toBe(input())
    await act(async () => { root.render(null) })
    expect(document.activeElement).toBe(before)
  })

  it('caps the Documents tier at 50 and shows the overflow row', async () => {
    const many: NavNode[] = Array.from({ length: 60 }, (_, i) => ({
      type: 'doc',
      name: `doc${i}.md`,
      title: `doc ${i}`,
      path: `docs/doc${i}.md`,
      kind: 'md'
    }))
    await render(props({ tree: many }))
    await act(async () => { setValue(input(), 'doc') })
    expect(container.querySelectorAll('[data-option][data-kind="doc"]').length).toBe(50)
    expect(container.querySelector('[data-more]')?.textContent).toBe('...and 10 more - keep typing')
  })
})
