import { useEffect, useMemo, useState } from 'react'
import type { BuildProgress, Project, ThemeChoice } from '@shared/types'
import EditProjectModal from './EditProjectModal'

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

function middleTruncate(value: string, max = 52): string {
  if (value.length <= max) return value
  const keep = Math.max(8, Math.floor((max - 1) / 2))
  return `${value.slice(0, keep)}…${value.slice(value.length - keep)}`
}

function compareName(a: Project, b: Project): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

// Local projects carry a single docCount; GitHub projects cache one count per
// ref, so report the currently-selected branch's count.
function docCountOf(project: Project): number {
  if (project.type === 'local') return project.docCount ?? 0
  return project.refs.find((ref) => ref.ref === project.currentRef)?.docCount ?? 0
}

export default function ManageProjects(props: ManageProjectsProps): React.JSX.Element {
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
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

  const rows = useMemo(() => props.projects.toSorted(compareName), [props.projects])
  const editingProject = editId ? props.projects.find((project) => project.id === editId) ?? null : null

  return (
    <section className="manage-projects">
      <header className="manage-projects-header">
        <h2>Projects</h2>
        <div className="manage-projects-header-actions">
          <button data-action="add-project" className="topbar-button active" onClick={props.onAddProject}>
            <i className="fa-solid fa-plus" aria-hidden="true" /> Add project
          </button>
          <button data-action="done" className="topbar-button" onClick={props.onDone}>Done</button>
        </div>
      </header>

      {props.projects.length === 0 ? (
        <div className="empty-state">
          <i className="empty-icon fa-solid fa-folder-open" aria-hidden="true" />
          <p>No projects yet — add one to get started.</p>
          <button data-action="add-project" className="topbar-button active" onClick={props.onAddProject}>
            Add project
          </button>
        </div>
      ) : (
        <ul className="project-list">
          {rows.map((project) => {
            const building = project.status === 'building'
            const progress = progressByProject[project.id]
            const progressText = building
              ? progress?.message ?? (progress ? STAGE_LABEL[progress.stage] : 'Building…')
              : null
            const confirmingDelete = deleteId === project.id

            return (
              <li className="project-item" data-row={project.id} key={project.id}>
                <button
                  className="project-name"
                  data-action="select"
                  onClick={() => props.onSelect(project.id)}
                  disabled={building}
                >
                  {project.name}
                </button>
                <code className="project-source" title={project.source}>
                  {middleTruncate(project.source)}
                </code>
                <span data-chip>{project.type}</span>
                <span className="project-count">{docCountOf(project)} docs</span>

                {progressText && (
                  <span className="project-status" role="status">{progressText}</span>
                )}

                <div className="project-actions">
                  {confirmingDelete ? (
                    <span className="delete-confirmation">
                      <span>Delete?</span>
                      <button
                        data-action="cancel-delete"
                        className="icon-button"
                        aria-label="Cancel delete"
                        onClick={() => setDeleteId(null)}
                      >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                      </button>
                      <button
                        data-action="confirm-delete"
                        className="icon-button danger"
                        aria-label={`Confirm delete ${project.name}`}
                        onClick={() => props.onDelete(project.id)}
                      >
                        <i className="fa-solid fa-check" aria-hidden="true" />
                      </button>
                    </span>
                  ) : (
                    <>
                      <button
                        data-action="edit"
                        className="icon-button"
                        aria-label={`Edit ${project.name}`}
                        onClick={() => setEditId(project.id)}
                        disabled={building}
                      >
                        <i className="fa-solid fa-pen-to-square" aria-hidden="true" />
                      </button>
                      <button
                        data-action="delete"
                        className="icon-button danger"
                        aria-label={`Delete ${project.name}`}
                        onClick={() => setDeleteId(project.id)}
                        disabled={building}
                      >
                        <i className="fa-solid fa-trash-can" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onRename={props.onRename}
          onSetTheme={props.onSetTheme}
          onSetDocsSubpath={props.onSetDocsSubpath}
          onClose={() => setEditId(null)}
        />
      )}
    </section>
  )
}
