import { describe, it, expect } from 'bun:test'
import { THEME_CHOICES } from '../src/shared/types'
import type { ThemeChoice, Project } from '../src/shared/types'

describe('shared ThemeChoice', () => {
  it('exposes the three theme choices as a runtime list', () => {
    expect([...THEME_CHOICES].sort()).toEqual(['dark', 'light', 'system'])
  })

  it('types themeId as a ThemeChoice on a project', () => {
    const t: ThemeChoice = 'dark'
    const p: Project = {
      id: 'a',
      name: 'x',
      type: 'local',
      source: '/tmp/x',
      addedAt: 'now',
      status: 'ok',
      themeId: t
    }
    expect(p.themeId).toBe('dark')
  })
})
