import type { NavNode, SearchResult } from '@shared/types'
import DocTree from './DocTree'
import SearchBox from './SearchBox'

interface Props {
  activeId: string | null
  tree: NavNode[]
  docPath: string | null
  onOpenDoc: (path: string) => void
  onOpenResult: (r: SearchResult) => void
}

export default function Sidebar(props: Props): React.JSX.Element {
  const { activeId, tree, docPath } = props
  return (
    <aside className="sidebar">
      <div className="scroll">
        <SearchBox projectId={activeId} onOpenResult={props.onOpenResult} />
        {activeId ? (
          <DocTree nodes={tree} docPath={docPath} onOpenDoc={props.onOpenDoc} />
        ) : (
          <div className="empty">No project selected.</div>
        )}
      </div>
    </aside>
  )
}
