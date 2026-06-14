import { describe, it, expect } from 'bun:test'
import { buildIndex, runSearch } from '../src/main/pipeline/index'
import type { Section } from '@shared/types'

const sections: Section[] = [
  { id: 'a.md#', docPath: 'a.md', docTitle: 'Auth', headingId: '', headingText: '', depth: 0, text: 'overview of authentication' },
  { id: 'a.md#tokens', docPath: 'a.md', docTitle: 'Auth', headingId: 'tokens', headingText: 'Tokens', depth: 2, text: 'Tokens refresh rotation' },
  { id: 'b.md#', docPath: 'b.md', docTitle: 'Billing', headingId: '', headingText: '', depth: 0, text: 'invoices and payments' }
]

describe('search index', () => {
  it('finds a section by body term', () => {
    const idx = buildIndex(sections)
    const results = runSearch(idx, 'rotation')
    expect(results[0].docPath).toBe('a.md')
    expect(results[0].headingId).toBe('tokens')
  })

  it('ranks a heading match above an incidental body match', () => {
    const idx = buildIndex(sections)
    const results = runSearch(idx, 'tokens')
    expect(results[0].headingText).toBe('Tokens')
  })

  it('returns empty for no matches', () => {
    const idx = buildIndex(sections)
    expect(runSearch(idx, 'zzzznomatch')).toEqual([])
  })
})

import { serializeIndex, loadIndex } from '../src/main/pipeline/index'

describe('index serialize/load', () => {
  it('roundtrips an index and reproduces search + snippet', () => {
    const sections2: Section[] = [
      { id: 'a.md#', docPath: 'a.md', docTitle: 'Alpha', headingId: '', headingText: '', depth: 0, text: 'install the widget' },
      { id: 'a.md#setup', docPath: 'a.md', docTitle: 'Alpha', headingId: 'setup', headingText: 'Setup', depth: 2, text: 'Setup run the setup script' }
    ]
    const original = buildIndex(sections2)
    const json = serializeIndex(original)
    const restored = loadIndex(json, sections2)
    const live = runSearch(original, 'setup')
    const cached = runSearch(restored, 'setup')
    expect(cached.map((r) => r.headingId)).toEqual(live.map((r) => r.headingId))
    expect(cached[0].snippet.length).toBeGreaterThan(0) // snippet needs the rebuilt section lookup
  })
})
