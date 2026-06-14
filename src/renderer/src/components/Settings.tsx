import { useEffect } from 'react'
import type { ThemeChoice, ThemeSettings } from '../lib/theme'

interface Props {
  settings: ThemeSettings
  onChange: (next: ThemeSettings) => void
  onClose: () => void
}

const OPTIONS: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: 'dark', label: 'Dark', icon: 'fa-moon' },
  { value: 'light', label: 'Light', icon: 'fa-sun' },
  { value: 'system', label: 'System', icon: 'fa-desktop' }
]

function Segmented({
  value,
  onSelect,
  label
}: {
  value: ThemeChoice
  onSelect: (v: ThemeChoice) => void
  label: string
}): React.JSX.Element {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          className={value === opt.value ? 'active' : ''}
          onClick={() => onSelect(opt.value)}
        >
          <i className={`seg-icon fa-solid ${opt.icon}`} aria-hidden="true" />
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function Settings({ settings, onChange, onClose }: Props): React.JSX.Element {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
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
          <div className="setting-row">
            <div className="setting-text">
              <span className="setting-name">Chrome</span>
              <span className="setting-hint">Sidebar, search, and navigation</span>
            </div>
            <Segmented
              label="Chrome theme"
              value={settings.chrome}
              onSelect={(v) => onChange({ ...settings, chrome: v })}
            />
          </div>
          <div className="setting-row">
            <div className="setting-text">
              <span className="setting-name">Document</span>
              <span className="setting-hint">The reading area</span>
            </div>
            <Segmented
              label="Document theme"
              value={settings.document}
              onSelect={(v) => onChange({ ...settings, document: v })}
            />
          </div>
        </div>
        <footer className="modal-footer">
          <span>
            Created by{' '}
            <a href="https://borkweb.com" target="_blank" rel="noreferrer">Matthew Batchelder</a>
          </span>
          <a
            className="credit-gh"
            href="https://github.com/borkweb/doc-viewer"
            target="_blank"
            rel="noreferrer"
            title="github.com/borkweb/doc-viewer"
            aria-label="View doc-viewer on GitHub"
          >
            <i className="fa-brands fa-github" aria-hidden="true" />
          </a>
        </footer>
      </div>
    </div>
  )
}
