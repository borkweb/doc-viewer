import { readdir, lstat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { DocKind } from '@shared/types'

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'vendor', 'coverage'
])
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_DOCS = 5000

export interface DiscoveredDoc {
  path: string // relative, posix-style separators
  kind: DocKind
}
export interface DiscoverResult {
  docs: DiscoveredDoc[]
  skipped: { path: string; reason: string }[]
}

function toPosix(p: string): string {
  return p.split(sep).join('/')
}

export async function discoverDetailed(root: string): Promise<DiscoverResult> {
  const found: { abs: string; rel: string; kind: DocKind; size: number }[] = []
  const skipped: { path: string; reason: string }[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (err) {
      skipped.push({ path: toPosix(relative(root, dir)), reason: `readdir failed: ${(err as Error).message}` })
      return
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        skipped.push({ path: toPosix(relative(root, abs)), reason: 'symlink skipped' })
        continue
      }
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue
        await walk(abs)
        continue
      }
      if (!entry.isFile()) continue
      const lower = entry.name.toLowerCase()
      const kind: DocKind | null = lower.endsWith('.md') ? 'md' : lower.endsWith('.html') ? 'html' : null
      if (!kind) continue
      const stat = await lstat(abs)
      if (stat.size > MAX_FILE_BYTES) {
        skipped.push({ path: toPosix(relative(root, abs)), reason: `oversized (${stat.size} bytes)` })
        continue
      }
      found.push({ abs, rel: toPosix(relative(root, abs)), kind, size: stat.size })
    }
  }

  await walk(root)

  // 1A: drop a .html when a same-named .md sibling exists.
  const mdSet = new Set(found.filter((f) => f.kind === 'md').map((f) => f.rel.replace(/\.md$/i, '')))
  const deduped = found.filter((f) => {
    if (f.kind === 'html') {
      const base = f.rel.replace(/\.html$/i, '')
      if (mdSet.has(base)) {
        skipped.push({ path: f.rel, reason: 'generated html shadowed by .md sibling' })
        return false
      }
    }
    return true
  })

  const capped = deduped.slice(0, MAX_DOCS)
  if (deduped.length > MAX_DOCS) {
    skipped.push({ path: '(many)', reason: `doc count capped at ${MAX_DOCS} (had ${deduped.length})` })
  }

  return {
    docs: capped.map((f) => ({ path: f.rel, kind: f.kind })),
    skipped
  }
}

export async function discover(root: string): Promise<DiscoveredDoc[]> {
  return (await discoverDetailed(root)).docs
}
