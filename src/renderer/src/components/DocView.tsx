import { useEffect, useRef, useState } from 'react'
import type { DocKind } from '@shared/types'
import { renderMarkdown, buildToc, enhanceDiagrams } from '../lib/render'

interface Props {
  projectId: string
  docPath: string
  scrollToId: string | null
}

export default function DocView({ projectId, docPath, scrollToId }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [kind, setKind] = useState<DocKind>('md')
  const [html, setHtml] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const doc = await window.api.getDoc(projectId, docPath)
      if (cancelled) return
      setKind(doc.kind)
      setHtml(doc.kind === 'md' ? renderMarkdown(doc.content) : doc.content)
    })()
    return () => { cancelled = true }
  }, [projectId, docPath])

  // After markdown HTML is in the DOM: build TOC, enhance diagrams, scroll.
  useEffect(() => {
    if (kind !== 'md' || !ref.current || !html) return
    buildToc(ref.current)
    void enhanceDiagrams(ref.current).then(() => {
      if (scrollToId && ref.current) {
        const el = ref.current.querySelector(`#${CSS.escape(scrollToId)}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  }, [html, kind, scrollToId])

  if (kind === 'html') {
    return (
      <iframe
        title={docPath}
        sandbox=""
        srcDoc={html}
        style={{ width: '100%', height: '80vh', border: 0 }}
      />
    )
  }

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
}
