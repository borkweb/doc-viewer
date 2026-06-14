import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from '../assets/highlight/highlight.min.js'
import mermaid from 'mermaid'
import svgPanZoom from 'svg-pan-zoom'
import { slugify } from '@shared/slug'

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

export interface TocEntry {
  id: string
  text: string
  depth: number
}

// A jumpable diagram, labeled by the top-level (h1) heading it sits under.
export interface DiagramRef {
  id: string // the diagram element id, e.g. "diagram-0"
  label: string
}

// Reading stats for the open document, shown in the status bar.
export interface DocStats {
  words: number
  diagrams: DiagramRef[] // rendered mermaid diagrams, in document order
}

// Compute stats from rendered content. Call after enhanceDiagrams so diagrams
// exist in the DOM and their source is counted as a diagram (not as words).
export function computeDocStats(container: HTMLElement): DocStats {
  // The word count is document content only. Clone and drop code-block chrome
  // (line-number gutter + toolbar) so gutter digits and button/badge labels
  // aren't counted as words. Diagrams are collected from the live container.
  const clone = container.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.code-gutter, .code-toolbar').forEach((el) => el.remove())
  const text = clone.textContent ?? ''
  const words = (text.match(/\S+/g) ?? []).length
  return { words, diagrams: collectDiagrams(container) }
}

// Walk the rendered content in document order, labeling each diagram by the
// nearest preceding top-level section heading (h2). A diagram that isn't beneath
// any h2 falls back to the enclosing h1 (the document title). Each new h1 resets
// the h2 context. Diagrams sharing a heading get a zero-padded ordinal suffix
// ("Heading 01", "Heading 02").
function collectDiagrams(container: HTMLElement): DiagramRef[] {
  const raw: { id: string; heading: string }[] = []
  let h1 = ''
  let h2 = ''
  container.querySelectorAll('h1, h2, .diagram').forEach((el) => {
    if (el.tagName === 'H1') {
      h1 = el.textContent?.trim() || ''
      h2 = ''
    } else if (el.tagName === 'H2') {
      h2 = el.textContent?.trim() || ''
    } else {
      raw.push({ id: el.id, heading: h2 || h1 || 'Diagram' })
    }
  })
  const totals = new Map<string, number>()
  raw.forEach((r) => totals.set(r.heading, (totals.get(r.heading) ?? 0) + 1))
  const seen = new Map<string, number>()
  return raw.map((r) => {
    if ((totals.get(r.heading) ?? 0) <= 1) return { id: r.id, label: r.heading }
    const n = (seen.get(r.heading) ?? 0) + 1
    seen.set(r.heading, n)
    return { id: r.id, label: `${r.heading} ${String(n).padStart(2, '0')}` }
  })
}

// Assign ids to headings and return the TOC. Call after setting innerHTML.
export function buildToc(container: HTMLElement): TocEntry[] {
  const toc: TocEntry[] = []
  const used = new Map<string, number>()
  container.querySelectorAll('h1, h2, h3').forEach((h) => {
    const base = slugify(h.textContent ?? '')
    const n = used.get(base) ?? 0
    used.set(base, n + 1)
    const id = n === 0 ? base : `${base}-${n}`
    h.id = id
    toc.push({ id, text: h.textContent ?? '', depth: Number(h.tagName[1]) })
  })
  return toc
}

// Syntax-highlight fenced code blocks. Runs before enhanceDiagrams and skips
// `language-mermaid`, which enhanceDiagrams replaces. Mutates the DOM in place;
// the generated markup is our own trusted output (post-sanitization).
export function highlightCode(container: HTMLElement): void {
  const blocks = container.querySelectorAll('pre > code:not(.language-mermaid)')
  blocks.forEach((node) => {
    const code = node as HTMLElement
    const source = code.textContent ?? ''

    // Resolve language: honor a declared `language-xxx` class if highlight.js
    // knows it (aliases like `ts`/`js` resolve), else auto-detect.
    const declared = Array.from(code.classList)
      .find((c) => c.startsWith('language-'))
      ?.slice('language-'.length)
    let lang: string | undefined
    if (declared && hljs.getLanguage(declared)) {
      code.innerHTML = hljs.highlight(source, { language: declared, ignoreIllegals: true }).value
      lang = declared
    } else {
      const auto = hljs.highlightAuto(source)
      code.innerHTML = auto.value
      lang = auto.language
    }
    code.classList.add('hljs')

    const pre = code.parentElement as HTMLElement

    const block = document.createElement('div')
    block.className = 'code-block'
    if (lang) block.dataset.lang = lang

    const toolbar = document.createElement('div')
    toolbar.className = 'code-toolbar'
    if (lang) {
      const badge = document.createElement('span')
      badge.className = 'code-lang'
      badge.textContent = lang
      toolbar.appendChild(badge)
    }
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'code-copy'
    copy.textContent = 'Copy'
    copy.addEventListener('click', () => {
      const reset = (): void => {
        copy.textContent = 'Copy'
        copy.classList.remove('copied')
      }
      // navigator.clipboard is undefined outside a secure context; guard it and
      // handle rejection so the button always gives feedback (never a silent
      // no-op or an unhandled promise rejection).
      void navigator.clipboard?.writeText(source).then(
        () => {
          copy.textContent = 'Copied!'
          copy.classList.add('copied')
          setTimeout(reset, 1500)
        },
        () => {
          copy.textContent = 'Failed'
          setTimeout(reset, 1500)
        }
      )
    })
    toolbar.appendChild(copy)

    const body = document.createElement('div')
    body.className = 'code-body'
    const gutter = document.createElement('div')
    gutter.className = 'code-gutter'
    gutter.setAttribute('aria-hidden', 'true')
    const lines = source.replace(/\n$/, '').split('\n')
    gutter.textContent = lines.map((_, i) => String(i + 1)).join('\n')

    // Swap the bare <pre> for the wrapped structure.
    pre.replaceWith(block)
    body.append(gutter, pre)
    block.append(toolbar, body)
  })
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
    wrap.id = `diagram-${i}` // jump target for the status bar
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
      // Use textContent (not innerHTML): mermaid errors can echo untrusted diagram source.
      const errEl = document.createElement('div')
      errEl.className = 'render-error'
      errEl.textContent = `Diagram failed: ${(err as Error).message}`
      canvas.replaceChildren(errEl)
    }
  }
}
