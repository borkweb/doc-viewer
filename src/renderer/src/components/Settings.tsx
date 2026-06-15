import { useEffect, useRef, useState } from 'react'
import { THEME_LIST, swatchColors, type ThemeSettings, type Theme } from '../lib/theme'

interface Props {
  settings: ThemeSettings
  onChange: (next: ThemeSettings) => void
  onClose: () => void
}

const DESCRIPTORS: Record<string, string> = {
  default: 'Cobalt dark chrome, light document',
  sepia: 'Warm paper, easy on the eyes',
  'high-contrast': 'Maximum legibility',
  graphite: 'Neutral graphite surfaces'
}

const DEFAULT_TOOLTIP = "Pinned: dark chrome with a light document - today's default look"

function Swatch({ theme }: { theme: Theme }): React.JSX.Element {
  if (theme.id === 'default') {
    const left = swatchColors(theme, 'dark')
    const right = swatchColors(theme, 'light')
    return (
      <div className="theme-swatch" data-swatch-split aria-hidden="true">
        <span className="theme-swatch-chip" style={{ background: left.bg }} />
        <span className="theme-swatch-chip" style={{ background: left.surface }} />
        <span className="theme-swatch-divider" />
        <span className="theme-swatch-chip" style={{ background: right.surface }} />
        <span className="theme-swatch-chip" style={{ background: right.bg }} />
        <span className="theme-swatch-accent" style={{ background: right.accent }} />
        <span className="theme-swatch-aa" style={{ color: right.fg, background: right.bg }}>Aa</span>
      </div>
    )
  }

  const c = swatchColors(theme, theme.base === 'light' ? 'light' : 'dark')
  return (
    <div className="theme-swatch" aria-hidden="true">
      <span className="theme-swatch-chip" style={{ background: c.bg }} />
      <span className="theme-swatch-chip" style={{ background: c.surface }} />
      <span className="theme-swatch-chip" style={{ background: c.surfaceAlt }} />
      <span className="theme-swatch-accent" style={{ background: c.accent }} />
      <span className="theme-swatch-aa" style={{ color: c.fg, background: c.bg }}>Aa</span>
    </div>
  )
}

export default function Settings({ settings, onChange, onClose }: Props): React.JSX.Element {
  const groupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const selectedIndex = Math.max(0, THEME_LIST.findIndex((t) => t.id === settings.themeId))
  const [focusIndex, setFocusIndex] = useState(selectedIndex)
  const commit = (id: string): void => onChange({ themeId: id })

  const moveFocus = (next: number): void => {
    setFocusIndex(next)
    const cards = groupRef.current?.querySelectorAll<HTMLElement>('[data-theme-card]')
    cards?.[next]?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent, index: number): void => {
    const n = THEME_LIST.length
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      commit(THEME_LIST[index].id)
      return
    }

    if (next >= 0) {
      e.preventDefault()
      moveFocus(next)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>Settings</h2>
          <button className="icon-button" onClick={onClose} title="Close" aria-label="Close">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </header>
        <div className="modal-body">
          <div className="section-label">Theme</div>
          <p className="section-hint">Applies to the whole app. Override per project in Manage Projects.</p>
          <div className="theme-gallery" role="radiogroup" aria-label="Theme" ref={groupRef}>
            {THEME_LIST.map((theme, index) => {
              const selected = theme.id === settings.themeId
              const label = theme.id === 'default' ? 'Default — mixed' : theme.name
              return (
                <button
                  key={theme.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${theme.name} (${selected ? 'selected' : 'not selected'})`}
                  data-theme-card
                  data-theme-id={theme.id}
                  className={`theme-card${selected ? ' is-selected' : ''}${index === focusIndex ? ' is-focused' : ''}`}
                  tabIndex={index === focusIndex ? 0 : -1}
                  title={theme.id === 'default' ? DEFAULT_TOOLTIP : undefined}
                  onClick={() => commit(theme.id)}
                  onKeyDown={(e) => onKeyDown(e, index)}
                >
                  <Swatch theme={theme} />
                  <span className="theme-card-name">
                    {label}
                    {selected && <i className="fa-solid fa-check theme-card-check" aria-hidden="true" />}
                  </span>
                  <span className="theme-card-desc">{DESCRIPTORS[theme.id] ?? ''}</span>
                </button>
              )
            })}
          </div>
        </div>
        <footer className="modal-footer">
          <span>
            Created by{' '}
            <a href="https://borkweb.com" target="_blank" rel="noreferrer">Matthew Batchelder</a>
          </span>
          <a
            className="credit-gh"
            href="https://github.com/borkweb/curator"
            target="_blank"
            rel="noreferrer"
            title="github.com/borkweb/curator"
            aria-label="View curator on GitHub"
          >
            <i className="fa-brands fa-github" aria-hidden="true" />
          </a>
        </footer>
      </div>
    </div>
  )
}
