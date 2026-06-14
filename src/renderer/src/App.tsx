import { useEffect, useState, useCallback } from 'react'
import type { Project, NavNode, SearchResult } from '@shared/types'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import DocView from './components/DocView'
import Settings from './components/Settings'
import StatusBar from './components/StatusBar'
import AddProjectModal from './components/AddProjectModal'
import BranchSwitcher from './components/BranchSwitcher'
import type { TocEntry, DocStats } from './lib/render'
import {
  loadThemeSettings,
  saveThemeSettings,
  resolveTheme,
  type ThemeSettings
} from './lib/theme'

// Find a document's display title in the nav tree by its relative path.
function findDocTitle(nodes: NavNode[], path: string): string | null {
  for (const node of nodes) {
    if (node.type === 'doc') {
      if (node.path === path) return node.title
    } else {
      const found = findDocTitle(node.children, path)
      if (found) return found
    }
  }
  return null
}

export default function App(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tree, setTree] = useState<NavNode[]>([])
  const [docPath, setDocPath] = useState<string | null>(null)
  const [scrollToId, setScrollToId] = useState<string | null>(null)
  // Bumped on every jump so DocView re-scrolls even to the same heading twice.
  const [scrollNonce, setScrollNonce] = useState(0)
  const [toc, setToc] = useState<TocEntry[]>([])
  const [stats, setStats] = useState<DocStats | null>(null)

  // Theme: chrome and document themed independently; 'system' follows the OS.
  const [theme, setTheme] = useState<ThemeSettings>(loadThemeSettings)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => { saveThemeSettings(theme) }, [theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const chromeTheme = resolveTheme(theme.chrome, systemDark)
  const docTheme = resolveTheme(theme.document, systemDark)

  const refreshProjects = useCallback(async () => {
    setProjects(await window.api.listProjects())
  }, [])

  useEffect(() => { void refreshProjects() }, [refreshProjects])

  // Clear per-document state on any navigation that changes the open doc.
  const resetDocState = useCallback(() => {
    setToc([])
    setStats(null)
  }, [])

  const selectProject = useCallback(async (id: string) => {
    setActiveId(id)
    setDocPath(null)
    resetDocState()
    const { tree } = await window.api.selectProject(id)
    setTree(tree)
  }, [resetDocState])

  const onAdded = useCallback(async (p: Project) => {
    setAddOpen(false)
    await refreshProjects()
    await selectProject(p.id)
  }, [refreshProjects, selectProject])

  const rebuild = useCallback(async () => {
    if (!activeId) return
    await window.api.rebuildProject(activeId)
    await refreshProjects()
    const { tree } = await window.api.selectProject(activeId)
    setTree(tree)
  }, [activeId, refreshProjects])

  const switchRef = useCallback(async (ref: string) => {
    if (!activeId) return
    const { tree } = await window.api.switchRef(activeId, ref)
    setTree(tree)
    setDocPath(null)
    setToc([])
    await refreshProjects()
  }, [activeId, refreshProjects])

  const addRef = useCallback(async (ref: string) => {
    if (!activeId) return
    const { tree } = await window.api.addRef(activeId, ref)
    setTree(tree)
    await refreshProjects()
  }, [activeId, refreshProjects])

  const removeRef = useCallback(async (ref: string) => {
    if (!activeId) return
    await window.api.removeRef(activeId, ref)
    await refreshProjects()
  }, [activeId, refreshProjects])

  const openResult = useCallback((r: SearchResult) => {
    setDocPath(r.docPath)
    resetDocState()
    setScrollToId(r.headingId || null)
    setScrollNonce((n) => n + 1)
  }, [resetDocState])

  const openDoc = useCallback((path: string) => {
    setDocPath(path)
    resetDocState()
    setScrollToId(null)
  }, [resetDocState])

  // Jump to a heading in the current doc (e.g. from the Contents menu).
  const jumpTo = useCallback((id: string) => {
    setScrollToId(id)
    setScrollNonce((n) => n + 1)
  }, [])

  const openPath = useCallback((target: string) => {
    void window.api.openPath(target)
  }, [])

  const activeProject = activeId ? projects.find((p) => p.id === activeId) ?? null : null
  const docTitle = docPath ? findDocTitle(tree, docPath) : null

  return (
    <div className="app-shell" data-theme={chromeTheme}>
      <TopBar
        projects={projects}
        activeId={activeId}
        activeProject={activeProject}
        docTitle={docTitle}
        toc={toc}
        onSelectProject={selectProject}
        onOpenAdd={() => setAddOpen(true)}
        onRebuild={rebuild}
        onJumpTo={jumpTo}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className={`app-body${activeId ? '' : ' no-sidebar'}`}>
        {activeId && (
          <Sidebar
            activeId={activeId}
            tree={tree}
            docPath={docPath}
            onOpenDoc={openDoc}
            onOpenResult={openResult}
          />
        )}
        <main className="content" data-theme={docTheme}>
          <div className="content-inner">
            {activeId && docPath ? (
              <DocView
                projectId={activeId}
                docPath={docPath}
                scrollToId={scrollToId}
                scrollNonce={scrollNonce}
                onToc={setToc}
                onStats={setStats}
              />
            ) : (
              <div className="empty-state">
                <i
                  className={`empty-icon fa-solid ${activeId ? 'fa-file-lines' : 'fa-folder-open'}`}
                  aria-hidden="true"
                />
                <p>{activeId ? 'Select a document.' : 'Add or select a project to begin.'}</p>
              </div>
            )}
          </div>
        </main>
      </div>
      {activeProject && (
        <StatusBar
          project={activeProject}
          stats={stats}
          onOpenPath={openPath}
          onJump={jumpTo}
          branchSwitcher={
            activeProject.type === 'github' ? (
              <BranchSwitcher
                refs={activeProject.refs}
                currentRef={activeProject.currentRef}
                onSwitch={switchRef}
                onAddRef={addRef}
                onRemoveRef={removeRef}
              />
            ) : undefined
          }
        />
      )}
      {addOpen && <AddProjectModal onAdded={onAdded} onClose={() => setAddOpen(false)} />}
      {settingsOpen && (
        <Settings settings={theme} onChange={setTheme} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  )
}
