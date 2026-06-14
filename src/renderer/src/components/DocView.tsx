import { useEffect, useRef, useState } from 'react'
import type { DocKind } from '@shared/types'
import { renderMarkdown, buildToc, enhanceDiagrams, type TocEntry } from '../lib/render'

interface Props {
  projectId: string
  docPath: string
  scrollToId: string | null
  scrollNonce: number
  onToc?: (toc: TocEntry[]) => void
}

export default function DocView({
  projectId,
  docPath,
  scrollToId,
  scrollNonce,
  onToc
}: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [kind, setKind] = useState<DocKind>('md')
  const [html, setHtml] = useState('')

  // Keep the current scroll target in a ref so both effects below can read the
  // latest value without forcing the render/enhance effect to re-run on jumps.
  const targetRef = useRef<string | null>(scrollToId)
  targetRef.current = scrollToId

  const doScroll = (): void => {
    const id = targetRef.current
    if (!id || !ref.current) return
    const el = ref.current.querySelector(`#${CSS.escape(id)}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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

  // After markdown HTML is in the DOM: build TOC (reporting it up), enhance
  // diagrams, then scroll to the initial target once layout settles.
  useEffect(() => {
    if (kind !== 'md' || !ref.current || !html) {
      onToc?.([])
      return
    }
    const container = ref.current
    onToc?.(buildToc(container))
    void enhanceDiagrams(container).then(doScroll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, kind])

  // Re-fire on every jump request — including repeats of the same heading on the
  // already-rendered doc — via the incrementing scrollNonce.
  useEffect(() => {
    if (kind === 'md') doScroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToId, scrollNonce])

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
