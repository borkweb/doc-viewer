import { marked } from 'marked'
import DOMPurify from 'dompurify'
import mermaid from 'mermaid'
import svgPanZoom from 'svg-pan-zoom'

marked.setOptions({ gfm: true, breaks: false })

let mermaidReady = false
function initMermaid(): void {
  if (mermaidReady) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'strict',
    flowchart: { useMaxWidth: false, htmlLabels: false },
    er: { useMaxWidth: false }
  })
  mermaidReady = true
}

// Markdown → sanitized HTML string.
export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false }) as string
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
}

export function slugifyHeading(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export interface TocEntry {
  id: string
  text: string
  depth: number
}

// Assign ids to headings and return the TOC. Call after setting innerHTML.
export function buildToc(container: HTMLElement): TocEntry[] {
  const toc: TocEntry[] = []
  const used = new Map<string, number>()
  container.querySelectorAll('h1, h2, h3').forEach((h) => {
    const base = slugifyHeading(h.textContent ?? '')
    const n = used.get(base) ?? 0
    used.set(base, n + 1)
    const id = n === 0 ? base : `${base}-${n}`
    h.id = id
    toc.push({ id, text: h.textContent ?? '', depth: Number(h.tagName[1]) })
  })
  return toc
}

// Convert ```mermaid blocks into zoomable, click-to-expand diagrams.
export async function enhanceDiagrams(container: HTMLElement): Promise<void> {
  initMermaid()
  const blocks = Array.from(container.querySelectorAll('pre > code.language-mermaid'))
  for (let i = 0; i < blocks.length; i++) {
    const code = blocks[i] as HTMLElement
    const src = code.textContent ?? ''
    const wrap = document.createElement('div')
    wrap.className = 'diagram'
    const canvas = document.createElement('div')
    canvas.className = 'diagram-canvas'
    wrap.appendChild(canvas)
    code.parentElement!.replaceWith(wrap)
    try {
      const { svg } = await mermaid.render(`mmd-${i}-${Date.now()}`, src)
      canvas.innerHTML = svg
      const svgEl = canvas.querySelector('svg')!
      svgEl.setAttribute('width', '100%')
      svgEl.setAttribute('height', '100%')
      svgEl.style.maxWidth = 'none'
      const pz = svgPanZoom(svgEl, {
        zoomEnabled: true, panEnabled: true, controlIconsEnabled: true,
        dblClickZoomEnabled: false, fit: true, center: true, minZoom: 0.2, maxZoom: 30
      })
      let downX = 0, downY = 0, downT = 0
      canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; downT = e.timeStamp })
      canvas.addEventListener('pointerup', (e) => {
        const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
        if (moved < 6 && e.timeStamp - downT < 400) {
          wrap.classList.toggle('expanded')
          requestAnimationFrame(() => { try { pz.resize(); pz.fit(); pz.center() } catch { /* noop */ } })
        }
      })
    } catch (err) {
      canvas.innerHTML = `<div class="render-error">Diagram failed: ${(err as Error).message}</div>`
    }
  }
}
