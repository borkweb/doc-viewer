import { resolve, relative, isAbsolute } from 'node:path'

export function safeResolve(root: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`Path outside project: ${relativePath}`)
  }
  const abs = resolve(root, relativePath)
  const rel = relative(root, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path outside project: ${relativePath}`)
  }
  return abs
}
