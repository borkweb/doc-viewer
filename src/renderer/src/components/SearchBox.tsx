import { useEffect, useRef, useState } from 'react'
import type { SearchResult } from '@shared/types'

interface Props {
  projectId: string | null
  onOpenResult: (r: SearchResult) => void
}

export default function SearchBox({ projectId, onOpenResult }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!projectId) { setResults([]); return }
    if (timer.current) clearTimeout(timer.current)
    if (!query.trim()) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setResults(await window.api.search(projectId, query))
    }, 150)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [query, projectId])

  return (
    <div>
      <input
        type="search"
        placeholder="Search docs…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', padding: '6px 8px', marginBottom: 8 }}
        disabled={!projectId}
      />
      {query.trim() && results.length === 0 && <div className="empty">No matches.</div>}
      {results.map((r) => (
        <button key={`${r.docPath}#${r.headingId}`} className="result" onClick={() => onOpenResult(r)}>
          <div className="h">{r.headingText || r.docTitle}</div>
          <div className="meta">{r.docTitle} · {r.docPath}</div>
          <div className="snip">{r.snippet}</div>
        </button>
      ))}
    </div>
  )
}
