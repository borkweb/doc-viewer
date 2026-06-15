import { describe, it, expect, beforeEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import Settings from '../src/renderer/src/components/Settings'
import { THEME_LIST, type ThemeSettings } from '../src/renderer/src/lib/theme'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

function props(
  over: Partial<{ settings: ThemeSettings; onChange: (n: ThemeSettings) => void; onClose: () => void }> = {}
): { settings: ThemeSettings; onChange: (n: ThemeSettings) => void; onClose: () => void } {
  return {
    settings: { themeId: 'default' },
    onChange: () => {},
    onClose: () => {},
    ...over
  }
}

async function render(p: ReturnType<typeof props>): Promise<void> {
  await act(async () => {
    root.render(createElement(Settings, p))
  })
}

const cards = (): HTMLElement[] => Array.from(container.querySelectorAll('[data-theme-card]'))

describe('Settings theme gallery', () => {
  it('renders one card per built-in theme inside a radiogroup', async () => {
    await render(props())
    expect(container.querySelector('[role="radiogroup"]')).toBeTruthy()
    expect(cards().length).toBe(THEME_LIST.length)
    expect(cards().map((c) => c.getAttribute('data-theme-id'))).toEqual(THEME_LIST.map((t) => t.id))
  })

  it('marks the card matching settings.themeId as selected', async () => {
    await render(props({ settings: { themeId: 'graphite' } }))
    const selected = container.querySelector('[data-theme-card][aria-checked="true"]') as HTMLElement
    expect(selected.getAttribute('data-theme-id')).toBe('graphite')
  })

  it('the Default card shows the split swatch and the "— mixed" label + tooltip', async () => {
    await render(props())
    const def = container.querySelector('[data-theme-card][data-theme-id="default"]') as HTMLElement
    expect(def.querySelector('[data-swatch-split]')).toBeTruthy()
    expect(def.textContent).toContain('Default — mixed')
    expect(def.getAttribute('title')).toContain('dark chrome')
  })

  it('commits on click and calls onChange with the clicked themeId', async () => {
    const calls: ThemeSettings[] = []
    await render(props({ onChange: (n) => { calls.push(n) } }))
    const sepia = container.querySelector('[data-theme-card][data-theme-id="sepia"]') as HTMLElement
    await act(async () => { sepia.click() })
    expect(calls).toEqual([{ themeId: 'sepia' }])
  })

  it('commits on Enter on a focused card', async () => {
    const calls: ThemeSettings[] = []
    await render(props({ onChange: (n) => { calls.push(n) } }))
    const hc = container.querySelector('[data-theme-card][data-theme-id="high-contrast"]') as HTMLElement
    await act(async () => {
      hc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(calls).toEqual([{ themeId: 'high-contrast' }])
  })

  it('commits on Space on a focused card', async () => {
    const calls: ThemeSettings[] = []
    await render(props({ onChange: (n) => { calls.push(n) } }))
    const graphite = container.querySelector('[data-theme-card][data-theme-id="graphite"]') as HTMLElement
    await act(async () => {
      graphite.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    })
    expect(calls).toEqual([{ themeId: 'graphite' }])
  })

  it('arrowing moves focus + the roving marker but does NOT commit', async () => {
    let calls = 0
    await render(props({ settings: { themeId: 'default' }, onChange: () => { calls++ } }))
    const first = cards()[0]
    await act(async () => { first.focus() })
    await act(async () => {
      first.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(calls).toBe(0)
    const checked = container.querySelector('[data-theme-card][aria-checked="true"]') as HTMLElement
    expect(checked.getAttribute('data-theme-id')).toBe('default')
    expect(cards()[1].getAttribute('tabindex')).toBe('0')
    expect(cards()[0].getAttribute('tabindex')).toBe('-1')
  })

  it('does NOT call onChange on hover/focus', async () => {
    let calls = 0
    await render(props({ onChange: () => { calls++ } }))
    const sepia = container.querySelector('[data-theme-card][data-theme-id="sepia"]') as HTMLElement
    await act(async () => {
      sepia.dispatchEvent(new window.Event('mousemove', { bubbles: true }))
    })
    await act(async () => {
      sepia.dispatchEvent(new window.Event('focus', { bubbles: true }))
    })
    expect(calls).toBe(0)
  })
})
