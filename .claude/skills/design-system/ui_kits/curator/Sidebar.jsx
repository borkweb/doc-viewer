/* Curator sidebar — project switcher, search, and the document tree.
   Composes the DS primitives: Select, IconButton, Input, TreeItem, SearchResult, Badge. */
const { Select, IconButton, Input, TreeItem, SearchResult, Badge } = window.CobaltReaderDesignSystem_feb28f

function StatusBadge({ status }) {
  if (status === 'building') return <Badge tone="warning" dot>Building</Badge>
  if (status === 'error') return <Badge tone="error" dot>Error</Badge>
  return <Badge tone="success" dot>Ready</Badge>
}

function Tree({ nodes, openDoc, activePath, depth }) {
  const [open, setOpen] = React.useState({})
  return nodes.map((node) => {
    if (node.type === 'folder') {
      const isOpen = open[node.path] ?? true
      return (
        <div key={node.path}>
          <TreeItem kind="folder" label={node.name} depth={depth} open={isOpen}
            onClick={() => setOpen((o) => ({ ...o, [node.path]: !isOpen }))} />
          {isOpen && <Tree nodes={node.children} openDoc={openDoc} activePath={activePath} depth={depth + 1} />}
        </div>
      )
    }
    return (
      <TreeItem key={node.path} kind={node.kind} label={node.title} depth={depth}
        active={activePath === node.path} onClick={() => openDoc(node.path)} />
    )
  })
}

function Sidebar({ projects, activeProject, onSelectProject, tree, openDoc, activePath,
                   query, setQuery, results, onOpenResult }) {
  const searching = query.trim().length > 0
  return (
    <aside className="dv-sidebar">
      <header className="dv-side-head">
        <Select flush value={activeProject ? activeProject.id : ''}
          onChange={(e) => onSelectProject(e.target.value)}
          placeholder="Select a project…"
          options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        <IconButton icon="fa-solid fa-plus" label="Add a project" />
      </header>

      {activeProject && (
        <div className="dv-proj-meta">
          <span className="dv-proj-sub">
            <i className={activeProject.type === 'github' ? 'fa-brands fa-github' : 'fa-solid fa-folder-open'}></i>
            {activeProject.sub}
          </span>
          <StatusBadge status={activeProject.status} />
        </div>
      )}

      <div className="dv-search">
        <Input flush type="search" icon="fa-solid fa-magnifying-glass"
          placeholder="Search docs…" value={query}
          onChange={(e) => setQuery(e.target.value)} disabled={!activeProject} />
      </div>

      <div className="dv-scroll">
        {!activeProject ? (
          <div className="dv-empty-side">No project selected.</div>
        ) : searching ? (
          results.length ? results.map((r) => (
            <SearchResult key={r.docPath + r.headingId} heading={r.heading}
              docTitle={r.docTitle} docPath={r.docPath} snippet={r.snippet}
              onClick={() => onOpenResult(r)} />
          )) : <div className="dv-empty-side">No matches.</div>
        ) : (
          <Tree nodes={tree} openDoc={openDoc} activePath={activePath} depth={0} />
        )}
      </div>
    </aside>
  )
}

window.DVSidebar = Sidebar
