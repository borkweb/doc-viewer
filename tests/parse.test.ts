import { describe, it, expect } from 'vitest'
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

  it('splits into an intro section plus one per heading', () => {
    const parsed = parseMarkdown('db.md', 'db.md', md)
    const headings = parsed.sections.map((s) => s.headingText)
    expect(headings).toEqual(['', 'Database Design', 'Tables', 'Indexes'])
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
