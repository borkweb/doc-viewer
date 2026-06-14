import { useState } from 'react'
import type { RefInfo } from '@shared/types'

interface Props {
  refs: RefInfo[]
  currentRef: string
  onSwitch: (ref: string) => void
  onAddRef: (ref: string) => void
  onRemoveRef: (ref: string) => void
}

export default function BranchSwitcher(props: Props): React.JSX.Element {
  const { refs, currentRef } = props
  const [adding, setAdding] = useState(false)
  const [newRef, setNewRef] = useState('')

  const submitNew = (): void => {
    const r = newRef.trim()
    if (!r) return
    props.onAddRef(r)
    setNewRef('')
    setAdding(false)
  }

  return (
    <div className="branch-switcher">
      <i className="fa-solid fa-code-branch" aria-hidden="true" />
      <select
        data-role="ref-select"
        className="topbar-select"
        value={currentRef}
        aria-label="Branch"
        onChange={(e) => props.onSwitch(e.target.value)}
      >
        {refs.map((r) => (
          <option key={r.ref} value={r.ref}>{r.ref}</option>
        ))}
      </select>
      {adding ? (
        <input
          className="branch-input"
          autoFocus
          placeholder="branch / tag"
          value={newRef}
          onChange={(e) => setNewRef(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitNew()
            if (e.key === 'Escape') setAdding(false)
          }}
          onBlur={() => setAdding(false)}
        />
      ) : (
        <button className="icon-button" title="Add branch" aria-label="Add branch" onClick={() => setAdding(true)}>
          <i className="fa-solid fa-plus" aria-hidden="true" />
        </button>
      )}
      {refs.length > 1 && (
        <button
          className="icon-button"
          title={`Remove ${currentRef} cache`}
          aria-label={`Remove ${currentRef} cache`}
          onClick={() => props.onRemoveRef(currentRef)}
        >
          <i className="fa-solid fa-trash" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
