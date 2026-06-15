// Curator theme model (Plan 5). A theme layers whitelisted CSS custom-property
// overrides over one of the two base `data-theme="dark|light"` palettes.
// Applied imperatively by App to the chrome and document roots.

export type Mode = 'dark' | 'light'
export type CssVar = `--${string}`
export type TokenOverrides = Partial<Record<CssVar, string>>

export type ThemeBase =
  | Mode
  | 'system'
  | { chrome: Mode | 'system'; document: Mode | 'system' }

export interface Theme {
  id: string
  name: string
  builtin: boolean
  base: ThemeBase
  variants: { dark?: TokenOverrides; light?: TokenOverrides }
}

export interface ResolvedTokens {
  mode: Mode
  overrides: TokenOverrides
}

export const THEMEABLE_TOKENS: readonly CssVar[] = [
  '--bg', '--surface', '--surface-alt', '--surface-raised',
  '--fg', '--muted', '--faint',
  '--border', '--border-strong',
  '--accent', '--accent-hover', '--accent-active', '--accent-soft', '--accent-ring',
  '--highlight', '--highlight-soft',
  '--code-bg', '--code-fg', '--table-head',
  '--diagram-bg', '--diagram-ink', '--mark-bg',
  '--scrollbar-thumb', '--scrollbar-thumb-hover'
]

export const DEFAULT_THEME_ID = 'default'

export function resolveTheme(
  theme: Theme,
  systemDark: boolean,
  region: 'chrome' | 'document'
): ResolvedTokens {
  const rawBase = typeof theme.base === 'object' ? theme.base[region] : theme.base
  const mode: Mode = rawBase === 'system' ? (systemDark ? 'dark' : 'light') : rawBase
  const overrides =
    theme.variants[mode] ?? theme.variants[mode === 'dark' ? 'light' : 'dark'] ?? {}
  return { mode, overrides }
}

export function applyTheme(el: HTMLElement, mode: Mode, overrides: TokenOverrides): void {
  el.setAttribute('data-theme', mode)
  for (const token of THEMEABLE_TOKENS) {
    const value = overrides[token]
    if (value != null) el.style.setProperty(token, value)
    else el.style.removeProperty(token)
  }
}

const SEPIA: TokenOverrides = {
  '--bg': '#f4ecd8', '--surface': '#efe6d0', '--surface-alt': '#e8dcc0', '--surface-raised': '#faf3e3',
  '--fg': '#433422', '--muted': '#7a6a52', '--faint': '#d6c6a8',
  '--border': '#ddcdaf', '--border-strong': '#c9b48f',
  '--accent': '#b5651d', '--accent-hover': '#c8762e', '--accent-active': '#8f4e16',
  '--accent-soft': 'rgb(181 101 29 / 12%)', '--accent-ring': 'rgb(181 101 29 / 35%)',
  '--highlight': '#b5651d', '--highlight-soft': 'rgb(181 101 29 / 16%)',
  '--code-bg': '#ece0c6', '--code-fg': '#4a3826', '--table-head': '#e8dcc0',
  '--diagram-bg': '#faf3e3', '--diagram-ink': '#433422', '--mark-bg': 'rgb(199 154 58 / 30%)',
  '--scrollbar-thumb': '#d6c6a8', '--scrollbar-thumb-hover': '#c9b48f'
}

const HC_DARK: TokenOverrides = {
  '--bg': '#000000', '--surface': '#0a0a0a', '--surface-alt': '#141414', '--surface-raised': '#1a1a1a',
  '--fg': '#ffffff', '--muted': '#cfcfcf', '--faint': '#3a3a3a',
  '--border': '#5a5a5a', '--border-strong': '#8a8a8a',
  '--accent': '#5ab0ff', '--accent-hover': '#8cc6ff', '--accent-active': '#2f95ff',
  '--accent-soft': 'rgb(90 176 255 / 22%)', '--accent-ring': 'rgb(90 176 255 / 70%)',
  '--highlight': '#ffd400', '--highlight-soft': 'rgb(255 212 0 / 22%)',
  '--code-bg': '#0a0a0a', '--code-fg': '#ffffff', '--table-head': '#141414',
  '--diagram-bg': '#000000', '--diagram-ink': '#ffffff', '--mark-bg': 'rgb(255 212 0 / 40%)',
  '--scrollbar-thumb': '#5a5a5a', '--scrollbar-thumb-hover': '#8a8a8a'
}

const HC_LIGHT: TokenOverrides = {
  '--bg': '#ffffff', '--surface': '#ffffff', '--surface-alt': '#f0f0f0', '--surface-raised': '#ffffff',
  '--fg': '#000000', '--muted': '#2e2e2e', '--faint': '#b0b0b0',
  '--border': '#6a6a6a', '--border-strong': '#2e2e2e',
  '--accent': '#0a52c0', '--accent-hover': '#0843a0', '--accent-active': '#063480',
  '--accent-soft': 'rgb(10 82 192 / 14%)', '--accent-ring': 'rgb(10 82 192 / 60%)',
  '--highlight': '#0a52c0', '--highlight-soft': 'rgb(10 82 192 / 16%)',
  '--code-bg': '#f0f0f0', '--code-fg': '#000000', '--table-head': '#e8e8e8',
  '--diagram-bg': '#ffffff', '--diagram-ink': '#000000', '--mark-bg': 'rgb(255 230 0 / 45%)',
  '--scrollbar-thumb': '#6a6a6a', '--scrollbar-thumb-hover': '#2e2e2e'
}

// Graphite keeps the cobalt accent family untouched.
const GRAPHITE_DARK: TokenOverrides = {
  '--bg': '#15171a', '--surface': '#1d2024', '--surface-alt': '#26292e', '--surface-raised': '#2f333a',
  '--fg': '#e8eaed', '--muted': '#8b9099', '--faint': '#2f333a',
  '--border': '#30343a', '--border-strong': '#3c4148',
  '--code-bg': '#1a1d21', '--code-fg': '#d4d7db', '--table-head': '#26292e',
  '--diagram-bg': '#1d2024', '--diagram-ink': '#e8eaed',
  '--scrollbar-thumb': '#30343a', '--scrollbar-thumb-hover': '#444a52'
}

export const BUILTIN_THEMES: Record<string, Theme> = {
  default: {
    id: 'default',
    name: 'Default',
    builtin: true,
    base: { chrome: 'dark', document: 'light' },
    variants: { dark: {}, light: {} }
  },
  sepia: {
    id: 'sepia',
    name: 'Sepia',
    builtin: true,
    base: 'light',
    variants: { light: SEPIA }
  },
  'high-contrast': {
    id: 'high-contrast',
    name: 'High contrast',
    builtin: true,
    base: 'system',
    variants: { dark: HC_DARK, light: HC_LIGHT }
  },
  graphite: {
    id: 'graphite',
    name: 'Graphite',
    builtin: true,
    base: 'dark',
    variants: { dark: GRAPHITE_DARK }
  }
}

export const THEME_LIST: Theme[] = Object.values(BUILTIN_THEMES)

const THEMEABLE_TOKEN_SET = new Set<string>(THEMEABLE_TOKENS)
for (const theme of THEME_LIST) {
  for (const variant of [theme.variants.dark, theme.variants.light]) {
    for (const key of Object.keys(variant ?? {})) {
      if (!THEMEABLE_TOKEN_SET.has(key)) throw new Error(`Theme ${theme.id} overrides unsupported token ${key}`)
    }
  }
}

export function themeById(id: string | undefined): Theme {
  return (id && BUILTIN_THEMES[id]) || BUILTIN_THEMES[DEFAULT_THEME_ID]
}

export const BASE_SWATCH: Record<Mode, { bg: string; surface: string; surfaceAlt: string; accent: string; fg: string }> = {
  dark: { bg: '#0a0f1e', surface: '#111d28', surfaceAlt: '#1c2b3a', accent: '#4a9eff', fg: '#f0f4ff' },
  light: { bg: '#ffffff', surface: '#eff3fb', surfaceAlt: '#e4ebf6', accent: '#1a7fe8', fg: '#14233a' }
}

export interface SwatchColors {
  bg: string
  surface: string
  surfaceAlt: string
  accent: string
  fg: string
}

export function swatchColors(theme: Theme, mode: Mode): SwatchColors {
  const base = BASE_SWATCH[mode]
  const ov = theme.variants[mode] ?? theme.variants[mode === 'dark' ? 'light' : 'dark'] ?? {}
  return {
    bg: ov['--bg'] ?? base.bg,
    surface: ov['--surface'] ?? base.surface,
    surfaceAlt: ov['--surface-alt'] ?? base.surfaceAlt,
    accent: ov['--accent'] ?? base.accent,
    fg: ov['--fg'] ?? base.fg
  }
}

export interface ThemeSettings {
  themeId: string
}

const STORAGE_KEY = 'curator.theme'
export const DEFAULT_THEME_SETTINGS: ThemeSettings = { themeId: DEFAULT_THEME_ID }

export function loadThemeSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_THEME_SETTINGS }
    const parsed = JSON.parse(raw) as { themeId?: unknown }
    if (typeof parsed?.themeId === 'string' && parsed.themeId in BUILTIN_THEMES) {
      return { themeId: parsed.themeId }
    }
    return { ...DEFAULT_THEME_SETTINGS }
  } catch {
    return { ...DEFAULT_THEME_SETTINGS }
  }
}

export function saveThemeSettings(settings: ThemeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore quota/availability — theme is non-critical state */
  }
}
