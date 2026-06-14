import { readFile } from 'node:fs/promises'
import type MiniSearch from 'minisearch'
import type { NavNode, NavFolder, ParsedDoc, SearchResult, DocKind } from '@shared/types'
import { getProject, updateProject } from './registry'
import { discover } from './pipeline/discover'
import { parseMarkdown, parseHtml } from './pipeline/parse'
import { buildIndex, runSearch } from './pipeline/index'
import { buildTree } from './tree'
import { safeResolve } from './util/pathsafe'

interface ActiveProject {
  id: string
  root: string
  docs: Map<string, ParsedDoc> // keyed by relative path
  index: MiniSearch
  tree: NavNode[]
}

let active: ActiveProject | null = null

export async function selectProject(id: string): Promise<{ tree: NavNode[]; docCount: number }> {
  const project = await getProject(id)
  if (!project) throw new Error(`Project not found: ${id}`)

  // Tear down previous active project (active-Project lifecycle).
  active = null

  const root = project.source
  const discovered = await discover(root)
  const docs: ParsedDoc[] = []
  for (const d of discovered) {
    if (d.kind === 'md') {
      const raw = await readFile(safeResolve(root, d.path), 'utf8')
      docs.push(parseMarkdown(d.path, d.path.split('/').pop()!, raw))
    } else {
      docs.push(parseHtml(d.path, d.path.split('/').pop()!))
    }
  }

  const sections = docs.flatMap((d) => d.sections)
  const index = buildIndex(sections)
  const tree = buildTree(docs)

  active = { id, root, docs: new Map(docs.map((d) => [d.path, d])), index, tree }
  await updateProject(id, { docCount: docs.length, lastBuiltAt: new Date().toISOString(), status: 'ok' })

  return { tree, docCount: docs.length }
}

function requireActive(id: string): ActiveProject {
  if (!active || active.id !== id) throw new Error(`Project not active: ${id}`)
  return active
}

export async function getDoc(id: string, relativePath: string): Promise<{ kind: DocKind; content: string }> {
  const a = requireActive(id)
  const abs = safeResolve(a.root, relativePath)
  const content = await readFile(abs, 'utf8')
  const kind: DocKind = relativePath.toLowerCase().endsWith('.html') ? 'html' : 'md'
  return { kind, content }
}

export async function search(id: string, query: string): Promise<SearchResult[]> {
  const a = requireActive(id)
  return runSearch(a.index, query)
}
