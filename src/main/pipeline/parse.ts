import type { ParsedDoc, Section, DocKind } from '@shared/types'

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function prettifyFilename(name: string): string {
  const base = name.replace(/\.(md|html)$/i, '').replace(/^\d+[-_]/, '')
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Cheap markdown → plain text for indexing/snippets (not for display).
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`[^`]*`/g, ' ') // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/^[#>\-*+]\s+/gm, ' ') // list/quote/heading markers
    .replace(/[*_~]+/g, '') // emphasis
    .replace(/\|/g, ' ') // table pipes
    .replace(/\s+/g, ' ')
    .trim()
}

interface HeadingLine {
  line: number
  depth: number
  text: string
}

export function parseMarkdown(path: string, name: string, raw: string): ParsedDoc {
  const lines = raw.split('\n')
  const headings: HeadingLine[] = []
  let inFence = false
  lines.forEach((line, i) => {
    if (/^```/.test(line)) inFence = !inFence
    if (inFence) return
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (m) headings.push({ line: i, depth: m[1].length, text: m[2].trim() })
  })

  const firstH1 = headings.find((h) => h.depth === 1)
  const title = firstH1 ? firstH1.text : prettifyFilename(name)

  const sections: Section[] = []
  const usedSlugs = new Map<string, number>()
  const uniqueSlug = (base: string): string => {
    const n = usedSlugs.get(base) ?? 0
    usedSlugs.set(base, n + 1)
    return n === 0 ? base : `${base}-${n}`
  }

  // Intro section: text before the first heading.
  const firstHeadingLine = headings.length ? headings[0].line : lines.length
  const introText = stripMarkdown(lines.slice(0, firstHeadingLine).join('\n'))
  if (introText) {
    sections.push({
      id: `${path}#`,
      docPath: path,
      docTitle: title,
      headingId: '',
      headingText: '',
      depth: 0,
      text: introText
    })
  }

  headings.forEach((h, idx) => {
    const start = h.line + 1
    const end = idx + 1 < headings.length ? headings[idx + 1].line : lines.length
    const body = stripMarkdown(lines.slice(start, end).join('\n'))
    const headingId = uniqueSlug(slugify(h.text))
    sections.push({
      id: `${path}#${headingId}`,
      docPath: path,
      docTitle: title,
      headingId,
      headingText: h.text,
      depth: h.depth,
      text: `${h.text} ${body}`.trim()
    })
  })

  return { path, name, kind: 'md' as DocKind, title, sections }
}

// HTML docs are not parsed into sections (orphan html renders raw). We still index
// the title (from filename) so they appear in search by name.
export function parseHtml(path: string, name: string): ParsedDoc {
  const title = prettifyFilename(name)
  return {
    path,
    name,
    kind: 'html',
    title,
    sections: [
      { id: `${path}#`, docPath: path, docTitle: title, headingId: '', headingText: '', depth: 0, text: title }
    ]
  }
}
