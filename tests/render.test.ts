// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/renderer/src/lib/render'

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
