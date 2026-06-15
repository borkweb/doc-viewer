import { useState } from 'react'
import type { Project } from '@shared/types'
import { THEME_LIST, swatchColors, themeById, DEFAULT_THEME_ID } from '../lib/theme'

const THEME_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Use global' },
  ...THEME_LIST.map((theme) => ({ value: theme.id, label: theme.name }))
]

function isKnownTheme(value: string | undefined): boolean {
  return !!value && THEME_OPTIONS.some((option) => option.value === value)
}

export interface EditProjectModalProps {
  project: Project
  onRename: (id: string, name: string) => void
  onSetTheme: (id: string, themeId: string | undefined) => void
  onSetDocsSubpath: (id: string, subpath: string) => Promise<{ docCount: number }>
  onClose: () => void
  globalThemeId?: string
}

function isCollisionError(error: unknown): boolean {
  const maybe = error as { code?: unknown; message?: unknown }
  if (maybe.code === 'collision') return true
  return typeof maybe.message === 'string' && maybe.message.toLowerCase().includes('collision')
}

export default function EditProjectModal(props: EditProjectModalProps): React.JSX.Element {
  const { project } = props
  const [name, setName] = useState(project.name)
  const [theme, setTheme] = useState<string>(isKnownTheme(project.themeId) ? project.themeId as string : '')
  const [subpath, setSubpath] = useState(project.type === 'github' ? project.docsSubpath ?? '' : '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    if (busy) return
    setMessage(null)

    const trimmedName = name.trim()
    if (trimmedName && trimmedName !== project.name) props.onRename(project.id, trimmedName)

    const nextTheme = theme || undefined
    if (nextTheme !== project.themeId) props.onSetTheme(project.id, nextTheme)

    // Docs subpath rebuilds the project, so it is async and may fail or find no docs.
    if (project.type === 'github') {
      const nextSubpath = subpath.trim()
      if (nextSubpath !== (project.docsSubpath ?? '')) {
        setBusy(true)
        try {
          const result = await props.onSetDocsSubpath(project.id, nextSubpath)
          if (result.docCount === 0) {
            setMessage('No docs found at that subpath.')
            setBusy(false)
            return
          }
        } catch (error) {
          setMessage(
            isCollisionError(error)
              ? 'Another project already uses that repo + subpath.'
              : "Couldn't rebuild at that subpath."
          )
          setBusy(false)
          return
        }
        setBusy(false)
      }
    }

    props.onClose()
  }

  return (
    <div className="modal-overlay" onClick={busy ? undefined : props.onClose}>
      <div className="modal edit-project-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>Edit project</h2>
          <button className="icon-button" aria-label="Close" onClick={props.onClose} disabled={busy}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span>Name</span>
            <input
              data-field="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save()
              }}
              disabled={busy}
              autoFocus
            />
          </label>

          <label className="field">
            <span>Theme</span>
            <div className="theme-field-row">
              <select
                data-role="theme-select"
                value={theme}
                onChange={(event) => setTheme(event.target.value)}
                disabled={busy}
              >
                {THEME_OPTIONS.map((option) => (
                  <option key={option.value || 'global'} value={option.value}>{option.label}</option>
                ))}
              </select>
              {(() => {
                const chipId = theme || props.globalThemeId || DEFAULT_THEME_ID
                const chipTheme = themeById(chipId)
                const c = swatchColors(chipTheme, chipTheme.base === 'light' ? 'light' : 'dark')
                return (
                  <span className="project-theme-chip" data-theme-chip data-chip-theme={chipId} aria-hidden="true">
                    <span className="project-theme-chip-band" style={{ background: c.bg }} />
                    <span className="project-theme-chip-band" style={{ background: c.surface }} />
                    <span className="project-theme-chip-band" style={{ background: c.accent }} />
                  </span>
                )
              })()}
            </div>
          </label>

          {project.type === 'github' && (
            <label className="field">
              <span>Docs subpath</span>
              <input
                data-field="docsSubpath"
                placeholder="e.g. docs"
                value={subpath}
                onChange={(event) => setSubpath(event.target.value)}
                disabled={busy}
              />
            </label>
          )}

          {message && <p className="add-error" role="status">{message}</p>}
        </div>

        <div className="edit-actions">
          <button data-action="cancel" className="topbar-button" onClick={props.onClose} disabled={busy}>
            Cancel
          </button>
          <button data-action="save" className="topbar-button active" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
