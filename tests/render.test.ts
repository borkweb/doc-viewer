import { describe, it, expect } from 'bun:test'
import { renderMarkdown, buildToc } from '../src/renderer/src/lib/render'
import { parseMarkdown } from '../src/main/pipeline/parse'

describe('renderMarkdown', () => {
  it('renders markdown to html', () => {
    const html = renderMarkdown('# Hello\n\nworld')
    expect(html).toContain('<h1')
    expect(html).toContain('Hello')
  })

  it('strips script tags (XSS sanitization)', () => {
    const html = renderMarkdown('ok <script>alert(1)</script> done')
    expect(html).not.toContain('<script')
  })

  it('strips img onerror handlers', () => {
    const html = renderMarkdown('![x](http://x "t")<img src=x onerror=alert(1)>')
    expect(html.toLowerCase()).not.toContain('onerror')
  })
})

describe('heading slug parity (parse vs buildToc)', () => {
  it('produces the same anchor for a heading containing a link', () => {
    const md = '## [Docs](https://x)\n\nbody'

    // parse pipeline (main): operates on raw heading text.
    const parsed = parseMarkdown('d.md', 'd.md', md)
    const section = parsed.sections.find((s) => s.headingText === '[Docs](https://x)')!
    expect(section).toBeDefined()

    // renderer: operates on the rendered DOM heading's textContent.
    const container = document.createElement('div')
    container.innerHTML = renderMarkdown(md)
    const toc = buildToc(container)
    const domId = container.querySelector('h2')!.id

    expect(domId).toBe(toc[0].id)
    // The two implementations must agree on the anchor.
    expect(domId).toBe(section.headingId)
    expect(section.headingId).toBe('docs')
  })
})
