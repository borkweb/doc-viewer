import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project, NavNode } from '@shared/types'
import { score } from '../lib/fuzzy'

const DOC_CAP = 50

interface Command {
  id: string
  label: string
  icon: string
  run: () => void
}

type Row =
  | { kind: 'project'; id: string; label: string; chip: string; icon: string; run: () => void; score: number }
  | { kind: 'doc'; id: string; label: string; path: string; run: () => void; score: number }
  | { kind: 'command'; id: string; label: string; icon: string; run: () => void; score: number }

export interface CommandPaletteProps {
  projects: Project[]
  activeId: string | null
  activeProject: Project | null
  tree: NavNode[]
  onSelectProject: (id: string) => void
  onOpenDoc: (path: string) => void
  onSwitchRef: () => void
  onAddProject: () => void
  onManageProjects: () => void
  onRebuild: () => void
  onSettings: () => void
  onClose: () => void
}

function flattenDocs(nodes: NavNode[], out: { path: string; title: string }[] = []): { path: string; title: string }[] {
  for (const node of nodes) {
    if (node.type === 'doc') out.push({ path: node.path, title: node.title })
    else flattenDocs(node.children, out)
  }
  return out
}

export default function CommandPalette({
  projects,
  activeId,
  activeProject,
  tree,
  onSelectProject,
  onOpenDoc,
  onSwitchRef,
  onAddProject,
  onManageProjects,
  onRebuild,
  onSettings,
  onClose
}: CommandPaletteProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<Element | null>(null)
  const q = query.trim()

  useEffect(() => {
    restoreFocusRef.current = document.activeElement
    inputRef.current?.focus()
    return () => {
      const previous = restoreFocusRef.current
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus()
    }
  }, [])

  const docs = useMemo(() => flattenDocs(tree), [tree])

  const commands = useMemo<Command[]>(() => {
    const items: Command[] = [
      { id: 'cmd:add', label: 'Add project', icon: 'fa-plus', run: onAddProject },
      { id: 'cmd:manage', label: 'Manage projects', icon: 'fa-list', run: onManageProjects }
    ]
    if (activeProject) {
      items.push({
        id: 'cmd:rebuild',
        label: activeProject.type === 'github' ? 'Pull latest' : 'Reindex',
        icon: 'fa-rotate',
        run: onRebuild
      })
    }
    if (activeProject?.type === 'github') {
      items.push({ id: 'cmd:ref', label: 'Switch ref...', icon: 'fa-code-branch', run: onSwitchRef })
    }
    items.push({ id: 'cmd:settings', label: 'Settings', icon: 'fa-gear', run: onSettings })
    return items
  }, [activeProject, onAddProject, onManageProjects, onRebuild, onSettings, onSwitchRef])

  const { projectRows, docRows, commandRows, docOverflow } = useMemo(() => {
    const rankKeep = (rows: Row[]): Row[] =>
      q ? rows.filter((row) => row.score > 0).sort((a, b) => b.score - a.score) : rows

    const projectRowsAll: Row[] = projects.map((project) => ({
      kind: 'project',
      id: project.id,
      label: project.name,
      chip: project.type,
      icon: project.type === 'github' ? 'fa-github' : 'fa-folder',
      run: () => onSelectProject(project.id),
      score: q ? score(q, project.name) : 1
    }))

    const commandRowsAll: Row[] = commands.map((command) => ({
      kind: 'command',
      id: command.id,
      label: command.label,
      icon: command.icon,
      run: command.run,
      score: q ? score(q, command.label) : 1
    }))

    let docRowsOut: Row[] = []
    let overflow = 0
    if (q && activeId) {
      const scored: Row[] = docs
        .map((doc) => ({
          kind: 'doc' as const,
          id: `doc:${doc.path}`,
          label: doc.title,
          path: doc.path,
          run: () => onOpenDoc(doc.path),
          score: Math.max(score(q, doc.title), score(q, doc.path))
        }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
      overflow = Math.max(0, scored.length - DOC_CAP)
      docRowsOut = scored.slice(0, DOC_CAP)
    }

    return {
      projectRows: rankKeep(projectRowsAll),
      docRows: docRowsOut,
      commandRows: rankKeep(commandRowsAll),
      docOverflow: overflow
    }
  }, [activeId, commands, docs, onOpenDoc, onSelectProject, projects, q])

  const selectable = useMemo(() => [...projectRows, ...docRows, ...commandRows], [projectRows, docRows, commandRows])

  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const activateAt = (index: number): void => {
    const row = selectable[index]
    if (!row) return
    row.run()
    onClose()
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (selectable.length ? (index + 1) % selectable.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (selectable.length ? (index - 1 + selectable.length) % selectable.length : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      activateAt(active)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    } else if (event.key === 'Tab') {
      event.preventDefault()
      if (event.shiftKey) {
        if (document.activeElement === inputRef.current) listRef.current?.focus()
        else inputRef.current?.focus()
      } else if (document.activeElement === inputRef.current) {
        listRef.current?.focus()
      } else {
        inputRef.current?.focus()
      }
    }
  }

  const noMatch = q !== '' && selectable.length === 0
  let rowIndex = -1
  const renderRow = (row: Row): React.JSX.Element => {
    rowIndex += 1
    const index = rowIndex
    const selected = index === active
    return (
      <div
        key={row.id}
        id={`palette-opt-${index}`}
        role="option"
        aria-selected={selected}
        data-option
        data-kind={row.kind}
        data-id={row.id}
        data-index={index}
        className={`palette-row${selected ? ' is-active' : ''}`}
        onMouseMove={() => setActive(index)}
        onClick={() => activateAt(index)}
      >
        <i className={`palette-icon fa-solid ${row.kind === 'doc' ? 'fa-file-lines' : row.icon}`} aria-hidden="true" />
        <span className="palette-label">{row.label}</span>
        {row.kind === 'doc' && <span className="palette-path">{row.path}</span>}
        {row.kind === 'project' && <span className="palette-chip" data-chip>{row.chip}</span>}
      </div>
    )
  }

  return (
    <div
      className="modal-overlay palette-overlay"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" data-palette>
        <input
          ref={inputRef}
          className="palette-input field"
          data-field="palette-search"
          type="text"
          placeholder="Search projects, docs, and commands..."
          value={query}
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={selectable.length ? `palette-opt-${active}` : undefined}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div
          className="palette-list"
          id="palette-list"
          role="listbox"
          ref={listRef}
          tabIndex={0}
          data-role="palette-list"
          onKeyDown={onKeyDown}
        >
          {noMatch ? (
            <div className="palette-empty" data-empty>No matches.</div>
          ) : (
            <>
              {projectRows.length > 0 && (
                <div className="palette-group" role="presentation" data-group="projects">Projects</div>
              )}
              {projectRows.map(renderRow)}

              {!q && activeId && <div className="palette-hint" data-hint>Type to search documents...</div>}
              {docRows.length > 0 && (
                <div className="palette-group" role="presentation" data-group="documents">
                  {`Documents - ${activeProject?.name ?? ''}`}
                </div>
              )}
              {docRows.map(renderRow)}
              {docOverflow > 0 && (
                <div className="palette-more" data-more>{`...and ${docOverflow} more - keep typing`}</div>
              )}

              {commandRows.length > 0 && (
                <div className="palette-group" role="presentation" data-group="commands">Commands</div>
              )}
              {commandRows.map(renderRow)}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
