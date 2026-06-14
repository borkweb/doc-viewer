import { describe, it, expect, beforeEach } from 'bun:test'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import BranchSwitcher from '../src/renderer/src/components/BranchSwitcher'
import type { RefInfo } from '../src/shared/types'

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

const refs: RefInfo[] = [
  { ref: 'main', lastBuiltAt: 'now', docCount: 3 },
  { ref: 'dev', lastBuiltAt: 'now', docCount: 1 }
]

describe('BranchSwitcher', () => {
  it('shows the current ref and switches on change', async () => {
    let switched = ''
    await act(async () => {
      root.render(
        createElement(BranchSwitcher, {
          refs, currentRef: 'main', onSwitch: (r) => { switched = r }, onAddRef: () => {}, onRemoveRef: () => {}
        })
      )
    })
    const select = container.querySelector('[data-role="ref-select"]') as HTMLSelectElement
    expect(select.value).toBe('main')
    await act(async () => {
      select.value = 'dev'
      select.dispatchEvent(new window.Event('change', { bubbles: true }))
    })
    expect(switched).toBe('dev')
  })
})
