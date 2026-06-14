import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project } from '@shared/types'
import type { TocEntry } from '../lib/render'

interface Props {
  projects: Project[]
  activeId: string | null
  activeProject: Project | null
  docTitle: string | null
  toc: TocEntry[]
  onSelectProject: (id: string) => void
  onOpenAdd: () => void
  onRebuild: () => void
  onJumpTo: (id: string) => void
  manageActive: boolean
  onToggleManage: () => void
  onOpenSettings: () => void
}

export default function TopBar(props: Props): React.JSX.Element {
  const { projects, activeId, docTitle, toc } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const sortedProjects = useMemo(
    () => projects.toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [projects]
  )

  // Contents is only meaningful when a document with headings is open.
  const hasToc = Boolean(docTitle) && toc.length > 0

  // Close the menu on outside click and Escape; restore focus on Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // If the doc (and its headings) goes away, drop the menu.
  useEffect(() => {
    if (!hasToc) setMenuOpen(false)
  }, [hasToc])

  const jump = (id: string): void => {
    props.onJumpTo(id)
    setMenuOpen(false)
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <select
          className="topbar-select"
          value={activeId ?? ''}
          onChange={(e) => props.onSelectProject(e.target.value)}
          aria-label="Project"
        >
          <option value="" disabled>Select a project…</option>
          {sortedProjects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          className="icon-button"
          onClick={props.onOpenAdd}
          title="Add project"
          aria-label="Add project"
        >
          <i className="fa-solid fa-plus" aria-hidden="true" />
        </button>
        {docTitle && (
          <div className="breadcrumb">
            <span className="breadcrumb-sep" aria-hidden="true">›</span>
            <span className="breadcrumb-title" title={docTitle}>{docTitle}</span>
          </div>
        )}
      </div>

      <div className="topbar-right">
        {props.activeProject && (
          <button
            className="icon-button"
            onClick={props.onRebuild}
            title={props.activeProject.type === 'github' ? 'Pull latest' : 'Reindex'}
            aria-label={props.activeProject.type === 'github' ? 'Pull latest' : 'Reindex'}
          >
            <i className="fa-solid fa-rotate" aria-hidden="true" />
          </button>
        )}
        {hasToc && (
          <div className="toc-wrap">
            <button
              ref={buttonRef}
              type="button"
              className={`topbar-button${menuOpen ? ' active' : ''}`}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-controls="toc-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <i className="fa-solid fa-list-ul" aria-hidden="true" />
              <span>Contents</span>
              <i className="fa-solid fa-chevron-down topbar-caret" aria-hidden="true" />
            </button>
            {menuOpen && (
              <div ref={menuRef} id="toc-menu" className="toc-menu" role="menu">
                {toc.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="menuitem"
                    className="toc-menu-item"
                    style={{
                      paddingLeft: `calc(var(--space-3) + ${entry.depth - 1} * var(--space-3))`
                    }}
                    onClick={() => jump(entry.id)}
                  >
                    {entry.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          className={`icon-button${props.manageActive ? ' active' : ''}`}
          data-action="toggle-manage"
          onClick={props.onToggleManage}
          title="Manage projects"
          aria-label="Manage projects"
          aria-pressed={props.manageActive}
        >
          <i className="fa-solid fa-folder-tree" aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          onClick={props.onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          <i className="fa-solid fa-gear" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
