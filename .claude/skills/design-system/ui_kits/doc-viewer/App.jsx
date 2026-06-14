/* Doc Viewer — interactive app shell. Owns selection + search state and wires
   the sidebar to the reading pane, inside a minimal dark window frame. */
const Sidebar = window.DVSidebar
const Reader = window.DVReader

function TitleBar({ title, theme, onToggleTheme }) {
  return (
    <div className="dv-titlebar">
      <div className="dv-lights">
        <span className="dv-light dv-close"></span>
        <span className="dv-light dv-min"></span>
        <span className="dv-light dv-max"></span>
      </div>
      <div className="dv-title">{title}</div>
      <button className="dv-theme-toggle" onClick={onToggleTheme}
        title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
        aria-label="Toggle theme">
        <i className={theme === 'light' ? 'fa-solid fa-moon' : 'fa-solid fa-sun'}></i>
      </button>
    </div>
  )
}

function App() {
  const { projects, tree, docs, sections } = window.DV_DATA
  const [activeId, setActiveId] = React.useState('p1')
  const [docPath, setDocPath] = React.useState('concepts/domain-model.md')
  const [query, setQuery] = React.useState('')
  const [scrollToId, setScrollToId] = React.useState(null)
  const [theme, setTheme] = React.useState(() => localStorage.getItem('cr-theme') || 'dark')

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('cr-theme', theme)
  }, [theme])
  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))

  const activeProject = projects.find((p) => p.id === activeId) || null
  const doc = docPath ? docs[docPath] : null

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return sections.filter((s) =>
      (s.heading + ' ' + s.docTitle + ' ' + s.snippet).toLowerCase().includes(q))
  }, [query])

  const onSelectProject = (id) => { setActiveId(id); setDocPath(null); setQuery('') }
  const openDoc = (path) => { setDocPath(path); setScrollToId(null) }
  const onOpenResult = (r) => { setDocPath(r.docPath); setScrollToId(r.headingId); setQuery('') }

  const titleName = activeProject ? activeProject.name : 'Doc Viewer'

  return (
    <div className="dv-window">
      <TitleBar title={`${titleName}${doc ? ' — ' + doc.title : ''}`} theme={theme} onToggleTheme={toggleTheme} />
      <div className="dv-body">
        <Sidebar
          projects={projects} activeProject={activeProject} onSelectProject={onSelectProject}
          tree={tree} openDoc={openDoc} activePath={docPath}
          query={query} setQuery={setQuery} results={results} onOpenResult={onOpenResult} />
        <Reader project={activeProject} doc={doc} docPath={docPath} scrollToId={scrollToId} />
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
