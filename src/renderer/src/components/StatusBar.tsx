import { useEffect, useRef, useState } from 'react'
import type { Project } from '@shared/types'
import type { DocStats } from '../lib/render'

interface Props {
  project: Project
  stats: DocStats | null
  onOpenPath: (target: string) => void
  onJump: (id: string) => void
  branchSwitcher?: React.ReactNode
}

function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
}

export default function StatusBar({
  project,
  stats,
  onOpenPath,
  onJump,
  branchSwitcher
}: Props): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const diagrams = stats?.diagrams ?? []

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

  // Drop the menu if the diagrams go away (e.g. switching documents).
  useEffect(() => {
    if (diagrams.length === 0) setMenuOpen(false)
  }, [diagrams.length])

  const jump = (id: string): void => {
    onJump(id)
    setMenuOpen(false)
  }

  return (
    <footer className="status-bar">
      <div className="status-left">
        {/* Local Projects link to their on-disk path (opens the file browser);
            GitHub Projects will link their repository URL when that lands. */}
        <button
          type="button"
          className="status-source"
          title="Show in file browser"
          onClick={() => onOpenPath(project.source)}
        >
          <i className="fa-solid fa-folder-open" aria-hidden="true" />
          <span className="status-source-text">{project.source}</span>
        </button>
        {branchSwitcher}
      </div>
      <div className="status-stats">
        {stats && (
          <>
            <span className="stat">{plural(stats.words, 'word')}</span>
            {diagrams.length > 0 && (
              <span className="stat diagram-wrap">
                <button
                  ref={buttonRef}
                  type="button"
                  className={`stat-link${menuOpen ? ' active' : ''}`}
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  aria-controls="diagram-menu"
                  title="Jump to a diagram"
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <i className="fa-solid fa-diagram-project" aria-hidden="true" />
                  {plural(diagrams.length, 'diagram')}
                </button>
                {menuOpen && (
                  <div ref={menuRef} id="diagram-menu" className="diagram-menu" role="menu">
                    {diagrams.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        role="menuitem"
                        className="diagram-menu-item"
                        onClick={() => jump(d.id)}
                      >
                        <i className="fa-solid fa-diagram-project" aria-hidden="true" />
                        <span className="diagram-menu-label">{d.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </span>
            )}
          </>
        )}
      </div>
    </footer>
  )
}
