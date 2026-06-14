import { useEffect, useRef, useState } from 'react'
import type { DocKind } from '@shared/types'
import {
  renderMarkdown,
  buildToc,
  highlightCode,
  enhanceDiagrams,
  computeDocStats,
  type TocEntry,
  type DocStats
} from '../lib/render'

interface Props {
  projectId: string
  docPath: string
  scrollToId: string | null
  scrollNonce: number
  restoreHeadingId?: string | null
  onToc?: (toc: TocEntry[]) => void
  onStats?: (stats: DocStats | null) => void
}

export default function DocView({
  projectId,
  docPath,
  scrollToId,
  scrollNonce,
  restoreHeadingId,
  onToc,
  onStats
}: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [kind, setKind] = useState<DocKind>('md')
  const [html, setHtml] = useState('')

  // Keep the current scroll target in a ref so both effects below can read the
  // latest value without forcing the render/enhance effect to re-run on jumps.
  const targetRef = useRef<string | null>(scrollToId)
  targetRef.current = scrollToId
  const restoreRef = useRef<string | null>(restoreHeadingId ?? null)
  restoreRef.current = restoreHeadingId ?? null

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

  // Render the sanitized markdown HTML imperatively (not via dangerouslySetInnerHTML)
  // so React doesn't own this subtree: buildToc and enhanceDiagrams mutate the DOM
  // directly, and the onToc/onStats state updates that follow would otherwise make
  // React re-apply innerHTML mid-enhancement and wipe the rendered diagrams.
  useEffect(() => {
    if (kind !== 'md' || !ref.current) {
      onToc?.([])
      onStats?.(null)
      return
    }
    const container = ref.current
    container.innerHTML = html
    if (!html) {
      onToc?.([])
      onStats?.(null)
      return
    }
    const toc = buildToc(container)
    onToc?.(toc)
    highlightCode(container)
    void enhanceDiagrams(container).then(() => {
      onStats?.(computeDocStats(container))
      if (targetRef.current) {
        doScroll()
      } else if (restoreRef.current) {
        const el = container.querySelector(`#${CSS.escape(restoreRef.current)}`)
        el?.scrollIntoView({ block: 'start' })
      }
    })
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

  return <div ref={ref} />
}
