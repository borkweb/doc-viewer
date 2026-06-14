import type { NavNode, NavFolder, ParsedDoc } from '@shared/types'

// Build a folder-mirroring nav tree from parsed docs, sorted alphabetically by
// filename at every level.
export function buildTree(docs: ParsedDoc[]): NavNode[] {
  const rootChildren: NavNode[] = []
  const folders = new Map<string, NavFolder>()

  const ensureFolder = (folderPath: string): NavNode[] => {
    if (folderPath === '') return rootChildren
    if (folders.has(folderPath)) return folders.get(folderPath)!.children
    const parts = folderPath.split('/')
    const name = parts[parts.length - 1]
    const parentPath = parts.slice(0, -1).join('/')
    const node: NavFolder = { type: 'folder', name, path: folderPath, children: [] }
    folders.set(folderPath, node)
    ensureFolder(parentPath).push(node)
    return node.children
  }

  for (const doc of docs) {
    const parts = doc.path.split('/')
    const folderPath = parts.slice(0, -1).join('/')
    ensureFolder(folderPath).push({
      type: 'doc',
      name: parts[parts.length - 1],
      title: doc.title,
      path: doc.path,
      kind: doc.kind
    })
  }

  const sortNodes = (nodes: NavNode[]): void => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    for (const n of nodes) if (n.type === 'folder') sortNodes(n.children)
  }
  sortNodes(rootChildren)
  return rootChildren
}
