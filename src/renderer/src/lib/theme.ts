// Theme selection for the two independently-themed regions: the app chrome
// (sidebar, search, navigation) and the document reading area. Each region
// carries a data-theme attribute resolved from one of these choices; 'system'
// follows the OS via prefers-color-scheme. Persisted in localStorage.

export type ThemeChoice = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

export interface ThemeSettings {
  chrome: ThemeChoice
  document: ThemeChoice
}

export const DEFAULT_THEME: ThemeSettings = { chrome: 'dark', document: 'light' }

const STORAGE_KEY = 'curator.theme'
const CHOICES: ThemeChoice[] = ['dark', 'light', 'system']

function isChoice(v: unknown): v is ThemeChoice {
  return typeof v === 'string' && (CHOICES as string[]).includes(v)
}

export function loadThemeSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_THEME
    const parsed = JSON.parse(raw) as Partial<ThemeSettings>
    return {
      chrome: isChoice(parsed.chrome) ? parsed.chrome : DEFAULT_THEME.chrome,
      document: isChoice(parsed.document) ? parsed.document : DEFAULT_THEME.document
    }
  } catch {
    return DEFAULT_THEME
  }
}

export function saveThemeSettings(settings: ThemeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore quota/availability errors — theme is non-critical state */
  }
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  if (choice === 'system') return systemDark ? 'dark' : 'light'
  return choice
}
