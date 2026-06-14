import MiniSearch from 'minisearch'
import type { Section, SearchResult } from '@shared/types'

const sectionById = new WeakMap<MiniSearch, Map<string, Section>>()

// Single source of truth for index options — buildIndex and loadIndex must agree
// (MiniSearch.loadJSON requires the same options used at build time).
const INDEX_OPTIONS = {
  idField: 'id',
  fields: ['headingText', 'docTitle', 'docPath', 'text'],
  storeFields: ['docPath', 'docTitle', 'headingId', 'headingText'],
  searchOptions: {
    boost: { headingText: 4, docTitle: 3, docPath: 2, text: 1 },
    prefix: true,
    fuzzy: 0.2
  }
}

export function buildIndex(sections: Section[]): MiniSearch {
  const mini = new MiniSearch(INDEX_OPTIONS)
  mini.addAll(sections)
  sectionById.set(mini, new Map(sections.map((s) => [s.id, s])))
  return mini
}

// Serialize a built index to a JSON string for the disk cache.
export function serializeIndex(index: MiniSearch): string {
  return JSON.stringify(index)
}

// Rebuild an index from cached JSON. The section lookup (needed for snippets and
// result shaping) is reconstructed from the persisted sections.
export function loadIndex(json: string, sections: Section[]): MiniSearch {
  const mini = MiniSearch.loadJSON(json, INDEX_OPTIONS)
  sectionById.set(mini, new Map(sections.map((s) => [s.id, s])))
  return mini
}

function makeSnippet(text: string, query: string): string {
  const q = query.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const lower = text.toLowerCase()
  const at = q ? lower.indexOf(q) : -1
  if (at < 0) return text.slice(0, 160)
  const start = Math.max(0, at - 60)
  const end = Math.min(text.length, at + 100)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

export function runSearch(index: MiniSearch, query: string): SearchResult[] {
  if (!query.trim()) return []
  const lookup = sectionById.get(index)!
  return index.search(query).map((r) => {
    const section = lookup.get(r.id as string)!
    return {
      docPath: section.docPath,
      docTitle: section.docTitle,
      headingId: section.headingId,
      headingText: section.headingText,
      snippet: makeSnippet(section.text, query),
      score: r.score
    }
  })
}
