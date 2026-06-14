import { describe, it, expect } from 'bun:test'
import { renderMarkdown, buildToc, highlightCode, computeDocStats } from '../src/renderer/src/lib/render'
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

describe('frontmatter rendering', () => {
  function fm(md: string): HTMLElement | null {
    const c = document.createElement('div')
    c.innerHTML = renderMarkdown(md)
    return c.querySelector('dl.frontmatter')
  }

  it('renders a key/value frontmatter block as a faded dl', () => {
    const dl = fm('---\ntitle: My Document\nauthor: Matt\n---\n\n# Body')
    expect(dl).not.toBeNull()
    const dts = Array.from(dl!.querySelectorAll('dt')).map((n) => n.textContent)
    const dds = Array.from(dl!.querySelectorAll('dd')).map((n) => n.textContent)
    expect(dts).toEqual(['title', 'author'])
    expect(dds).toEqual(['My Document', 'Matt'])
  })

  it('renders the body after the frontmatter', () => {
    const c = document.createElement('div')
    c.innerHTML = renderMarkdown('---\ntitle: T\n---\n\n# Heading\n\nbody')
    expect(c.querySelector('h1')?.textContent).toBe('Heading')
  })

  it('tolerates leading blank lines before the opening fence', () => {
    expect(fm('\n\n---\ntitle: T\n---\n\nbody')).not.toBeNull()
  })

  it('does not treat content as frontmatter when the closing fence is missing', () => {
    const c = document.createElement('div')
    c.innerHTML = renderMarkdown('---\ntitle: T\n\nbody with no closer')
    expect(c.querySelector('dl.frontmatter')).toBeNull()
  })

  it('does not treat a mid-document --- as frontmatter', () => {
    const c = document.createElement('div')
    c.innerHTML = renderMarkdown('# Intro\n\n---\ntitle: T\n---\n')
    expect(c.querySelector('dl.frontmatter')).toBeNull()
  })

  it('splits a value on the first colon only', () => {
    const dl = fm('---\ntime: 12:30\n---\n')
    expect(dl!.querySelector('dt')?.textContent).toBe('time')
    expect(dl!.querySelector('dd')?.textContent).toBe('12:30')
  })

  it('renders a colon-less line as a full-width loose row', () => {
    const dl = fm('---\ntags:\n- draft\n---\n')
    const loose = dl!.querySelector('dd.frontmatter-loose')
    expect(loose?.textContent).toBe('- draft')
  })

  it('sanitizes HTML in a frontmatter value', () => {
    const c = document.createElement('div')
    c.innerHTML = renderMarkdown('---\ntitle: <script>alert(1)</script>\n---\n')
    expect(c.innerHTML.toLowerCase()).not.toContain('<script')
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

describe('highlightCode', () => {
  function setup(md: string): HTMLElement {
    const c = document.createElement('div')
    c.innerHTML = renderMarkdown(md)
    highlightCode(c)
    return c
  }

  it('adds hljs token spans to a fenced code block', () => {
    const c = setup('```ts\nconst x: number = 1\n```')
    const code = c.querySelector('pre > code')!
    expect(code.classList.contains('hljs')).toBe(true)
    expect(code.innerHTML).toContain('hljs-keyword')
  })

  it('leaves mermaid blocks untouched for enhanceDiagrams', () => {
    const c = setup('```mermaid\ngraph TD; A-->B\n```')
    expect(c.querySelector('code.language-mermaid')).not.toBeNull()
    expect(c.querySelector('.code-block')).toBeNull()
  })

  it('shows a language badge with the resolved language', () => {
    const c = setup('```ts\nconst x = 1\n```')
    expect(c.querySelector('.code-lang')?.textContent).toBe('ts')
  })

  it('renders a copy button', () => {
    const c = setup('```js\nfoo()\n```')
    expect(c.querySelector('button.code-copy')).not.toBeNull()
  })

  it('numbers each source line in the gutter', () => {
    const c = setup('```js\na\nb\nc\n```')
    expect(c.querySelector('.code-gutter')?.getAttribute('aria-hidden')).toBe('true')
    expect(c.querySelector('.code-gutter')?.textContent).toBe('1\n2\n3')
  })

  it('moves the pre into a .code-block wrapper', () => {
    const c = setup('```js\nfoo()\n```')
    expect(c.querySelector('.code-block .code-body > pre > code.hljs')).not.toBeNull()
  })
})

describe('computeDocStats excludes code chrome', () => {
  it('does not count gutter numbers or toolbar labels as words', () => {
    const c = document.createElement('div')
    c.innerHTML = renderMarkdown('hello world\n\n```js\na\nb\n```')
    highlightCode(c)
    const stats = computeDocStats(c)
    // "hello" "world" + code words "a" "b" = 4. Gutter ("1" "2"), the "js"
    // badge, and "Copy" must NOT be counted.
    expect(stats.words).toBe(4)
  })

  it('does not count frontmatter keys/values as words', () => {
    const c = document.createElement('div')
    c.innerHTML = renderMarkdown('---\ntitle: My Document\nauthor: Matt\n---\n\nhello world')
    const stats = computeDocStats(c)
    // Only the body "hello" "world" = 2. Frontmatter text is excluded.
    expect(stats.words).toBe(2)
  })
})
