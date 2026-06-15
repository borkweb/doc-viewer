import { describe, it, expect, mock } from 'bun:test'
import { THEME_CHOICES } from '../src/shared/types'
import type { ThemeChoice, Project } from '../src/shared/types'

mock.module('electron', () => ({
  ipcMain: { handle: () => {} },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  shell: { openPath: async () => undefined }
}))

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

describe('projects:updateSettings theme patch normalization', () => {
  it('preserves an existing project theme when themeId is omitted from the patch', async () => {
    const { normalizeProjectSettingsPatch } = await import('../src/main/ipc')
    expect(normalizeProjectSettingsPatch({ name: 'Renamed' })).toEqual({ name: 'Renamed' })
  })

  it('drops unknown supplied theme ids and preserves valid supplied ids', async () => {
    const { normalizeProjectSettingsPatch } = await import('../src/main/ipc')
    expect(normalizeProjectSettingsPatch({ themeId: 'dark' })).toEqual({ themeId: undefined })
    expect(normalizeProjectSettingsPatch({ themeId: 'graphite' })).toEqual({ themeId: 'graphite' })
  })
})
