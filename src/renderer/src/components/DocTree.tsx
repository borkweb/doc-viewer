import type { NavNode } from '@shared/types'

interface Props {
  nodes: NavNode[]
  docPath: string | null
  onOpenDoc: (path: string) => void
  depth?: number
}

export default function DocTree({ nodes, docPath, onOpenDoc, depth = 0 }: Props): React.JSX.Element {
  return (
    <div>
      {nodes.map((node) =>
        node.type === 'folder' ? (
          <div key={node.path} style={{ paddingLeft: depth * 10 }}>
            <div className="tree-folder">{node.name}</div>
            <DocTree nodes={node.children} docPath={docPath} onOpenDoc={onOpenDoc} depth={depth + 1} />
          </div>
        ) : (
          <button
            key={node.path}
            className={`tree-item${docPath === node.path ? ' active' : ''}`}
            style={{ paddingLeft: 8 + depth * 10 }}
            title={node.name}
            onClick={() => onOpenDoc(node.path)}
          >
            {node.title}
          </button>
        )
      )}
    </div>
  )
}
