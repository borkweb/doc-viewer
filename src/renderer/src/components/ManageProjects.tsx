import { useEffect, useMemo, useState } from 'react'
import type { BuildProgress, Project, ThemeChoice } from '@shared/types'

export interface ManageProjectsProps {
  projects: Project[]
  onRename: (id: string, name: string) => void
  onSetTheme: (id: string, themeId: ThemeChoice | undefined) => void
  onSetDocsSubpath: (id: string, subpath: string) => Promise<{ docCount: number }>
  onDelete: (id: string) => void
  onSelect: (id: string) => void
  onAddProject: () => void
  onDone: () => void
}

type SortMode = 'name' | 'type' | 'recent'

const THEME_OPTIONS: Array<{ value: '' | ThemeChoice; label: string }> = [
  { value: '', label: 'Global' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' }
]

const STAGE_LABEL: Record<BuildProgress['stage'], string> = {
  cloning: 'Cloning…',
  resolving: 'Resolving default branch…',
  discovering: 'Discovering docs…',
  parsing: 'Parsing…',
  indexing: 'Indexing…',
  caching: 'Caching…',
  cleanup: 'Cleaning up…',
  done: 'Done',
  error: 'Error'
}

function middleTruncate(value: string, max = 44): string {
  if (value.length <= max) return value
  const keep = Math.max(8, Math.floor((max - 1) / 2))
  return `${value.slice(0, keep)}…${value.slice(value.length - keep)}`
}

function compareName(a: Project, b: Project): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

function lastBuiltTime(project: Project): number {
  if (project.type === 'local') return Date.parse(project.lastBuiltAt ?? '') || 0
  return Math.max(0, ...project.refs.map((ref) => Date.parse(ref.lastBuiltAt) || 0))
}

function isCollisionError(error: unknown): boolean {
  const maybe = error as { code?: unknown; message?: unknown }
  if (maybe.code === 'collision') return true
  return typeof maybe.message === 'string' && maybe.message.toLowerCase().includes('collision')
}

export default function ManageProjects(props: ManageProjectsProps): React.JSX.Element {
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<SortMode>('name')
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [subpathId, setSubpathId] = useState<string | null>(null)
  const [subpathValue, setSubpathValue] = useState('')
  const [subpathBusyId, setSubpathBusyId] = useState<string | null>(null)
  const [subpathMessages, setSubpathMessages] = useState<Record<string, string>>({})
  const [progressByProject, setProgressByProject] = useState<Record<string, BuildProgress>>({})

  useEffect(() => {
    const unsub = window.api.onBuildProgress((progress) => {
      setProgressByProject((current) => ({
        ...current,
        [progress.projectId]: progress
      }))
    })
    return unsub
  }, [])

  const rows = useMemo(() => {
    const query = filter.trim().toLowerCase()
    return props.projects
      .filter((project) => {
        if (!query) return true
        return `${project.name} ${project.source}`.toLowerCase().includes(query)
      })
      .toSorted((a, b) => {
        if (sort === 'type') {
          if (a.type !== b.type) return a.type === 'local' ? -1 : 1
          return compareName(a, b)
        }
        if (sort === 'recent') {
          const diff = lastBuiltTime(b) - lastBuiltTime(a)
          return diff || compareName(a, b)
        }
        return compareName(a, b)
      })
  }, [filter, props.projects, sort])

  const startRename = (project: Project): void => {
    setRenameId(project.id)
    setRenameValue(project.name)
    setDeleteId(null)
  }

  const commitRename = (project: Project): void => {
    const nextName = renameValue.trim()
    setRenameId(null)
    if (!nextName || nextName === project.name) return
    props.onRename(project.id, nextName)
  }

  const cancelRename = (): void => {
    setRenameId(null)
    setRenameValue('')
  }

  const startSubpath = (project: Project): void => {
    if (project.type !== 'github') return
    setSubpathId(project.id)
    setSubpathValue(project.docsSubpath ?? '')
    setSubpathMessages((current) => {
      const next = { ...current }
      delete next[project.id]
      return next
    })
    setDeleteId(null)
  }

  const commitSubpath = async (project: Project): Promise<void> => {
    if (project.type !== 'github' || subpathBusyId) return
    const nextSubpath = subpathValue.trim()
    setSubpathBusyId(project.id)
    setSubpathMessages((current) => {
      const next = { ...current }
      delete next[project.id]
      return next
    })
    try {
      const result = await props.onSetDocsSubpath(project.id, nextSubpath)
      setSubpathId(null)
      setSubpathMessages((current) => {
        const next = { ...current }
        if (result.docCount === 0) next[project.id] = 'No docs found at that subpath.'
        else delete next[project.id]
        return next
      })
    } catch (error) {
      setSubpathMessages((current) => ({
        ...current,
        [project.id]: isCollisionError(error)
          ? 'Another project already uses that repo + subpath.'
          : "Couldn't rebuild at that subpath."
      }))
    } finally {
      setSubpathBusyId(null)
    }
  }

  const clearFilter = (): void => setFilter('')

  return (
    <section className="manage-projects">
      <header className="manage-projects-header">
        <h2>Manage Projects</h2>
        <button data-action="done" onClick={props.onDone}>Done</button>
      </header>

      <div className="manage-projects-toolbar">
        <input
          data-role="filter"
          placeholder="Filter projects…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <select
          data-role="sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortMode)}
        >
          <option value="name">Sort: Name</option>
          <option value="type">Sort: Type</option>
          <option value="recent">Sort: Recently built</option>
        </select>
      </div>

      {props.projects.length === 0 ? (
        <div className="empty-state">
          <p>No projects yet — add one to get started.</p>
          <button data-action="add-project" onClick={props.onAddProject}>Add project</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <p>No projects match "{filter}".</p>
          <button data-action="clear-filter" onClick={clearFilter}>Clear filter</button>
        </div>
      ) : (
        <div className="manage-projects-list">
          {rows.map((project) => {
            const editingRename = renameId === project.id
            const editingSubpath = subpathId === project.id
            const confirmingDelete = deleteId === project.id
            const busy = subpathBusyId === project.id
            const disabled = project.status === 'building' || busy
            const progress = progressByProject[project.id]
            const progressText = progress?.message ?? (progress ? STAGE_LABEL[progress.stage] : null)

            return (
              <article className="manage-project-row" data-row={project.id} key={project.id}>
                <div className="manage-project-primary">
                  {editingRename ? (
                    <input
                      data-field="rename"
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitRename(project)
                        if (event.key === 'Escape') cancelRename()
                      }}
                      onBlur={() => commitRename(project)}
                      disabled={disabled}
                      autoFocus
                    />
                  ) : (
                    <button
                      data-action="select"
                      onClick={() => props.onSelect(project.id)}
                      disabled={disabled}
                    >
                      {project.name}
                    </button>
                  )}
                  <code className="mono project-source" title={project.source}>
                    {middleTruncate(project.source)}
                  </code>
                  <span data-chip>{project.type}</span>
                  <span className="project-count">
                    {project.type === 'local'
                      ? `${project.docCount ?? 0} docs`
                      : `${project.refs.length} branches`}
                  </span>
                </div>

                <div className="manage-project-actions">
                  <button
                    data-action="rename"
                    onClick={() => startRename(project)}
                    disabled={disabled}
                  >
                    Rename
                  </button>
                  <select
                    data-role="theme-select"
                    value={project.themeId ?? ''}
                    onChange={(event) => {
                      const value = event.target.value
                      props.onSetTheme(project.id, value ? (value as ThemeChoice) : undefined)
                    }}
                    disabled={disabled}
                  >
                    {THEME_OPTIONS.map((option) => (
                      <option key={option.value || 'global'} value={option.value}>{option.label}</option>
                    ))}
                  </select>

                  {project.type === 'github' && (
                    editingSubpath ? (
                      <span className="docs-subpath-edit">
                        <input
                          data-field="docsSubpath"
                          placeholder="docs subpath (e.g. docs)"
                          value={subpathValue}
                          onChange={(event) => setSubpathValue(event.target.value)}
                          disabled={disabled}
                        />
                        <button
                          data-action="commit-subpath"
                          onClick={() => { void commitSubpath(project) }}
                          disabled={disabled}
                        >
                          Commit
                        </button>
                      </span>
                    ) : (
                      <button
                        data-action="edit-subpath"
                        onClick={() => startSubpath(project)}
                        disabled={disabled}
                      >
                        Edit subpath
                      </button>
                    )
                  )}

                  {confirmingDelete ? (
                    <span className="delete-confirmation">
                      <span>Delete {project.name}?</span>
                      <button
                        data-action="cancel-delete"
                        onClick={() => setDeleteId(null)}
                        disabled={disabled}
                      >
                        Cancel
                      </button>
                      <button
                        data-action="confirm-delete"
                        onClick={() => props.onDelete(project.id)}
                        disabled={disabled}
                      >
                        Confirm
                      </button>
                    </span>
                  ) : (
                    <button
                      data-action="delete"
                      onClick={() => {
                        setDeleteId(project.id)
                        setRenameId(null)
                      }}
                      disabled={disabled}
                    >
                      Delete
                    </button>
                  )}
                </div>

                {(progressText || subpathMessages[project.id]) && (
                  <p className="project-status" role="status">
                    {progressText ?? subpathMessages[project.id]}
                  </p>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
