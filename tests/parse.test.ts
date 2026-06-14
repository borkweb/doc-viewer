import { describe, it, expect } from 'bun:test'
import { parseMarkdown, slugify, prettifyFilename } from '../src/main/pipeline/parse'

describe('slugify', () => {
  it('slugs heading text', () => {
    expect(slugify('Domain Model & Notes')).toBe('domain-model-notes')
  })
})

describe('prettifyFilename', () => {
  it('strips numeric prefix and extension', () => {
    expect(prettifyFilename('03-domain-model.md')).toBe('Domain Model')
  })
})

describe('parseMarkdown', () => {
  const md = [
    '# Database Design',
    '',
    'Intro paragraph.',
    '',
    '## Tables',
    '',
    'Some **bold** text about tables.',
    '',
    '## Indexes',
    '',
    'Index notes.'
  ].join('\n')

  it('uses the first H1 as the title', () => {
    const parsed = parseMarkdown('db.md', 'db.md', md)
    expect(parsed.title).toBe('Database Design')
  })

  it('splits into one section per heading (no empty intro when the doc starts with a heading)', () => {
    const parsed = parseMarkdown('db.md', 'db.md', md)
    const headings = parsed.sections.map((s) => s.headingText)
    expect(headings).toEqual(['Database Design', 'Tables', 'Indexes'])
  })

  it('emits an intro section for content before the first heading', () => {
    const withIntro = 'Preface text.\n\n# Title\n\nbody'
    const parsed = parseMarkdown('x.md', 'x.md', withIntro)
    expect(parsed.sections[0].headingText).toBe('')
    expect(parsed.sections[0].text).toContain('Preface text')
  })

  it('strips markdown from section text', () => {
    const parsed = parseMarkdown('db.md', 'db.md', md)
    const tables = parsed.sections.find((s) => s.headingText === 'Tables')!
    expect(tables.text).toContain('bold text about tables')
    expect(tables.text).not.toContain('**')
  })

  it('falls back to prettified filename when no H1', () => {
    const parsed = parseMarkdown('09-conventions.md', '09-conventions.md', 'no heading here')
    expect(parsed.title).toBe('Conventions')
  })
})
