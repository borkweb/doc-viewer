import type { Project, NavNode, SearchResult } from '@shared/types'
import DocTree from './DocTree'
import SearchBox from './SearchBox'

interface Props {
  projects: Project[]
  activeId: string | null
  tree: NavNode[]
  docPath: string | null
  onSelectProject: (id: string) => void
  onAddProject: () => void
  onOpenDoc: (path: string) => void
  onOpenResult: (r: SearchResult) => void
}

export default function Sidebar(props: Props): React.JSX.Element {
  const { projects, activeId, tree, docPath } = props
  return (
    <aside className="sidebar">
      <header>
        <select
          value={activeId ?? ''}
          onChange={(e) => props.onSelectProject(e.target.value)}
          style={{ flex: 1 }}
        >
          <option value="" disabled>Select a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button onClick={props.onAddProject} title="Add a local directory">＋</button>
      </header>
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
