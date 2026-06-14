import { useEffect, useRef, useState } from 'react'
import type { Project, BuildProgress } from '@shared/types'

type Tab = 'local' | 'github'

interface Props {
  onAdded: (project: Project) => void
  onClose: () => void
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

export default function AddProjectModal({ onAdded, onClose }: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('github')
  const [source, setSource] = useState('')
  const [ref, setRef] = useState('')
  const [docsSubpath, setDocsSubpath] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<BuildProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const addedIdRef = useRef<string | null>(null)

  // Subscribe to streamed build progress while a github build runs.
  useEffect(() => {
    const unsub = window.api.onBuildProgress((p) => setProgress(p))
    return unsub
  }, [])

  const addLocal = async (): Promise<void> => {
    setError(null)
    const dir = await window.api.pickDirectory()
    if (!dir) return
    setBusy(true)
    try {
      const p = await window.api.addLocalProject(dir)
      onAdded(p)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const addGithub = async (): Promise<void> => {
    const src = source.trim()
    if (!src) {
      setError('Enter a GitHub URL or owner/repo.')
      return
    }
    setError(null)
    setBusy(true)
    setProgress(null)
    try {
      const p = await window.api.addGithubProject(src, {
        ref: ref.trim() || undefined,
        docsSubpath: docsSubpath.trim() || undefined
      })
      addedIdRef.current = p.id
      onAdded(p)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const cancel = (): void => {
    if (addedIdRef.current) void window.api.cancelBuild(addedIdRef.current)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="modal add-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Add project</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose} disabled={busy}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </header>

        <div className="add-tabs" role="tablist">
          <button
            role="tab"
            data-tab="github"
            aria-selected={tab === 'github'}
            className={`add-tab${tab === 'github' ? ' active' : ''}`}
            onClick={() => setTab('github')}
            disabled={busy}
          >
            GitHub
          </button>
          <button
            role="tab"
            data-tab="local"
            aria-selected={tab === 'local'}
            className={`add-tab${tab === 'local' ? ' active' : ''}`}
            onClick={() => setTab('local')}
            disabled={busy}
          >
            Local Directory
          </button>
        </div>

        {tab === 'github' ? (
          <div className="add-body">
            <label className="field">
              <span>Repository</span>
              <input
                data-field="source"
                placeholder="owner/repo or https://github.com/owner/repo"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="field">
              <span>Branch / ref (optional)</span>
              <input
                data-field="ref"
                placeholder="default branch"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="field">
              <span>Docs subpath (optional)</span>
              <input
                data-field="docsSubpath"
                placeholder="e.g. docs"
                value={docsSubpath}
                onChange={(e) => setDocsSubpath(e.target.value)}
                disabled={busy}
              />
            </label>
            {busy && progress && (
              <div className="add-progress" role="status">
                <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                <span>{STAGE_LABEL[progress.stage]}</span>
                {typeof progress.docCount === 'number' && <span> · {progress.docCount} docs</span>}
              </div>
            )}
            {error && <p className="add-error">{error}</p>}
            <div className="add-actions">
              {busy ? (
                <button className="topbar-button" onClick={cancel}>Cancel</button>
              ) : (
                <button className="topbar-button active" data-action="submit-github" onClick={addGithub}>
                  Add
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="add-body">
            <p className="add-hint">Choose a local directory to index live.</p>
            {error && <p className="add-error">{error}</p>}
            <div className="add-actions">
              <button className="topbar-button active" data-action="pick-local" onClick={addLocal} disabled={busy}>
                Choose directory…
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
