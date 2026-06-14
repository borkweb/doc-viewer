import { useEffect, useState, useCallback } from 'react'
import type { Project, NavNode, SearchResult, ThemeChoice } from '@shared/types'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import DocView from './components/DocView'
import Settings from './components/Settings'
import StatusBar from './components/StatusBar'
import AddProjectModal from './components/AddProjectModal'
import BranchSwitcher from './components/BranchSwitcher'
import ManageProjects from './components/ManageProjects'
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

function treeHasPath(nodes: NavNode[], path: string): boolean {
  for (const node of nodes) {
    if (node.type === 'doc') {
      if (node.path === path) return true
    } else if (treeHasPath(node.children, path)) {
      return true
    }
  }
  return false
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
  const [view, setView] = useState<'docs' | 'manage'>('docs')

  useEffect(() => { saveThemeSettings(theme) }, [theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const activeProject = activeId ? projects.find((p) => p.id === activeId) ?? null : null
  const chromeTheme = resolveTheme(theme.chrome, systemDark)
  const docTheme = resolveTheme(activeProject?.themeId ?? theme.document, systemDark)

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
    setView('docs')
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

  const renameProject = useCallback(async (id: string, name: string) => {
    await window.api.updateProjectSettings(id, { name })
    await refreshProjects()
  }, [refreshProjects])

  const setProjectTheme = useCallback(async (id: string, themeId: ThemeChoice | undefined) => {
    await window.api.updateProjectSettings(id, { themeId })
    await refreshProjects()
  }, [refreshProjects])

  const setProjectDocsSubpath = useCallback(async (id: string, subpath: string) => {
    const result = await window.api.setDocsSubpath(id, subpath)
    await refreshProjects()
    if (id === activeId) {
      setTree(result.tree)
      if (docPath && !treeHasPath(result.tree, docPath)) {
        setDocPath(null)
        resetDocState()
      }
    }
    return { docCount: result.docCount }
  }, [activeId, docPath, refreshProjects, resetDocState])

  const deleteProject = useCallback(async (id: string) => {
    await window.api.removeProject(id)
    if (id === activeId) {
      setActiveId(null)
      setTree([])
      setDocPath(null)
      resetDocState()
    }
    await refreshProjects()
  }, [activeId, refreshProjects, resetDocState])

  const docTitle = docPath ? findDocTitle(tree, docPath) : null
  const manageActive = view === 'manage'

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
        manageActive={manageActive}
        onToggleManage={() => setView((current) => current === 'manage' ? 'docs' : 'manage')}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className={`app-body${activeId && !manageActive ? '' : ' no-sidebar'}`}>
        {activeId && !manageActive && (
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
            {manageActive ? (
              <ManageProjects
                projects={projects}
                onRename={renameProject}
                onSetTheme={setProjectTheme}
                onSetDocsSubpath={setProjectDocsSubpath}
                onDelete={deleteProject}
                onSelect={selectProject}
                onAddProject={() => setAddOpen(true)}
                onDone={() => setView('docs')}
              />
            ) : activeId && docPath ? (
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
      {activeProject && !manageActive && (
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
