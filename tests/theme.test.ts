import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  resolveTheme,
  applyTheme,
  swatchColors,
  BUILTIN_THEMES,
  THEME_LIST,
  THEMEABLE_TOKENS,
  DEFAULT_THEME_ID,
  themeById,
  loadThemeSettings,
  saveThemeSettings,
  type Theme
} from '../src/renderer/src/lib/theme'
import { stubLocalStorage } from './helpers/localStorage'

let restoreLs: () => void

beforeEach(() => {
  restoreLs = stubLocalStorage()
})

afterEach(() => {
  restoreLs()
})

describe('resolveTheme', () => {
  it('base "system" follows systemDark', () => {
    const t: Theme = { id: 't', name: 'T', builtin: true, base: 'system', variants: { dark: {}, light: {} } }
    expect(resolveTheme(t, true, 'document').mode).toBe('dark')
    expect(resolveTheme(t, false, 'document').mode).toBe('light')
  })

  it('a pinned base ignores systemDark', () => {
    const t: Theme = { id: 't', name: 'T', builtin: true, base: 'light', variants: { light: { '--bg': '#fff' } } }
    expect(resolveTheme(t, true, 'document').mode).toBe('light')
    expect(resolveTheme(t, true, 'document').overrides['--bg']).toBe('#fff')
  })

  it('Default per-region base resolves chrome=dark, document=light from one theme', () => {
    const def = BUILTIN_THEMES[DEFAULT_THEME_ID]
    expect(resolveTheme(def, false, 'chrome').mode).toBe('dark')
    expect(resolveTheme(def, false, 'document').mode).toBe('light')
    expect(resolveTheme(def, true, 'document').mode).toBe('light')
  })

  it('missing variant falls back to the other variant, else {}', () => {
    const darkOnly: Theme = { id: 'd', name: 'D', builtin: true, base: 'light', variants: { dark: { '--bg': '#000' } } }
    expect(resolveTheme(darkOnly, false, 'document').mode).toBe('light')
    expect(resolveTheme(darkOnly, false, 'document').overrides['--bg']).toBe('#000')
    const empty: Theme = { id: 'e', name: 'E', builtin: true, base: 'dark', variants: {} }
    expect(resolveTheme(empty, false, 'document').overrides).toEqual({})
  })
})

describe('applyTheme', () => {
  it('sets data-theme and writes each override, clearing tokens the next theme omits', () => {
    const el = document.createElement('div')
    applyTheme(el, 'light', { '--bg': '#f4ecd8', '--accent': '#b5651d' })
    expect(el.getAttribute('data-theme')).toBe('light')
    expect(el.style.getPropertyValue('--bg')).toBe('#f4ecd8')
    expect(el.style.getPropertyValue('--accent')).toBe('#b5651d')

    applyTheme(el, 'dark', { '--bg': '#15171a' })
    expect(el.getAttribute('data-theme')).toBe('dark')
    expect(el.style.getPropertyValue('--bg')).toBe('#15171a')
    expect(el.style.getPropertyValue('--accent')).toBe('')
  })

  it('ignores a non-whitelisted override key', () => {
    const el = document.createElement('div')
    applyTheme(el, 'dark', { '--not-a-theme-token': 'red' } as never)
    expect(el.style.getPropertyValue('--not-a-theme-token')).toBe('')
  })
})

describe('BUILTIN_THEMES registry', () => {
  it('exposes exactly the 4 presets in order', () => {
    expect(THEME_LIST.map((t) => t.id)).toEqual(['default', 'sepia', 'high-contrast', 'graphite'])
  })

  it('every preset override key is in THEMEABLE_TOKENS (whitelist invariant)', () => {
    const allowed = new Set<string>(THEMEABLE_TOKENS)
    for (const theme of THEME_LIST) {
      for (const variant of [theme.variants.dark, theme.variants.light]) {
        for (const key of Object.keys(variant ?? {})) expect(allowed.has(key)).toBe(true)
      }
    }
  })

  it('Default overrides nothing; Graphite keeps the cobalt accent (no --accent override)', () => {
    expect(BUILTIN_THEMES.default.variants).toEqual({ dark: {}, light: {} })
    const g = BUILTIN_THEMES.graphite.variants.dark ?? {}
    expect(g['--accent']).toBeUndefined()
    expect(g['--bg']).toBeDefined()
  })

  it('themeById falls back to Default for an unknown id', () => {
    expect(themeById('nope').id).toBe(DEFAULT_THEME_ID)
    expect(themeById(undefined).id).toBe(DEFAULT_THEME_ID)
    expect(themeById('sepia').id).toBe('sepia')
  })
})

describe('swatchColors', () => {
  it('layers a theme override over the base palette for the swatch band', () => {
    const sepia = BUILTIN_THEMES.sepia
    const sepiaBg = sepia.variants.light?.['--bg']
    expect(sepiaBg).toBeDefined()
    expect(swatchColors(sepia, 'light').bg).toBe(sepiaBg as string)
    expect(swatchColors(BUILTIN_THEMES.default, 'dark').bg).toBe('#0a0f1e')
  })

  it("Default's light-half swatch equals the light base palette (BASE_SWATCH pin)", () => {
    expect(swatchColors(BUILTIN_THEMES.default, 'light')).toEqual({
      bg: '#ffffff',
      surface: '#eff3fb',
      surfaceAlt: '#e4ebf6',
      accent: '#1a7fe8',
      fg: '#14233a'
    })
  })
})

describe('loadThemeSettings migration', () => {
  it('returns Default for an absent store', () => {
    expect(loadThemeSettings()).toEqual({ themeId: DEFAULT_THEME_ID })
  })

  it('migrates a legacy { chrome, document } blob to Default', () => {
    localStorage.setItem('curator.theme', JSON.stringify({ chrome: 'dark', document: 'light' }))
    expect(loadThemeSettings()).toEqual({ themeId: DEFAULT_THEME_ID })
  })

  it('returns Default for an unknown themeId', () => {
    localStorage.setItem('curator.theme', JSON.stringify({ themeId: 'made-up' }))
    expect(loadThemeSettings()).toEqual({ themeId: DEFAULT_THEME_ID })
  })

  it('round-trips a valid themeId', () => {
    saveThemeSettings({ themeId: 'graphite' })
    expect(loadThemeSettings()).toEqual({ themeId: 'graphite' })
  })
})
