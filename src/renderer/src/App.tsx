import { useEffect, useState, useCallback, useRef } from 'react'
import type { Project, NavNode, SearchResult, ThemeChoice } from '@shared/types'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import DocView from './components/DocView'
import Settings from './components/Settings'
import StatusBar from './components/StatusBar'
import AddProjectModal from './components/AddProjectModal'
import BranchSwitcher from './components/BranchSwitcher'
import ManageProjects from './components/ManageProjects'
import CommandPalette from './components/CommandPalette'
import type { TocEntry, DocStats } from './lib/render'
import {
  loadThemeSettings,
  saveThemeSettings,
  resolveTheme,
  type ThemeSettings
} from './lib/theme'
import { loadSession, saveSession, pickAnchor, type SessionState } from './lib/session'

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
  const [restoreHeadingId, setRestoreHeadingId] = useState<string | null>(null)
  // Bumped on every jump so DocView re-scrolls even to the same heading twice.
  const [scrollNonce, setScrollNonce] = useState(0)
  const [toc, setToc] = useState<TocEntry[]>([])
  const [stats, setStats] = useState<DocStats | null>(null)
  const [docRemoved, setDocRemoved] = useState(false)
  const [docReloadNonce, setDocReloadNonce] = useState(0)
  const mainRef = useRef<HTMLElement>(null)
  const [initialSession] = useState<SessionState>(loadSession)
  const sessionRef = useRef<SessionState>(initialSession)
  const didRunRef = useRef(false)

  // Theme: chrome and document themed independently; 'system' follows the OS.
  const [theme, setTheme] = useState<ThemeSettings>(loadThemeSettings)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [view, setView] = useState<'docs' | 'manage'>('docs')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [refFocusNonce, setRefFocusNonce] = useState(0)

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

  // Clear per-document state on any navigation that changes the open doc.
  const resetDocState = useCallback(() => {
    setToc([])
    setStats(null)
  }, [])

  useEffect(() => {
    if (didRunRef.current) return
    didRunRef.current = true
    void (async () => {
      const list = await window.api.listProjects()
      setProjects(list)

      const saved = sessionRef.current
      const pid = saved.lastProjectId
      if (!pid) return

      const project = list.find((p) => p.id === pid)
      if (!project || project.status === 'unavailable') return

    setActiveId(pid)
    setDocPath(null)
    setRestoreHeadingId(null)
    setDocRemoved(false)
    resetDocState()
      const { tree: nextTree } = await window.api.selectProject(pid)
      setTree(nextTree)

      const anchor = saved.perProject[pid]
      if (anchor && treeHasPath(nextTree, anchor.docPath)) {
        setRestoreHeadingId(anchor.headingId ?? null)
        setScrollToId(null)
        setDocPath(anchor.docPath)
        resetDocState()
      }
    })()
  }, [resetDocState])

  const selectProject = useCallback(async (id: string) => {
    setView('docs')
    setActiveId(id)
    setDocPath(null)
    setRestoreHeadingId(null)
    setDocRemoved(false)
    resetDocState()
    sessionRef.current.lastProjectId = id
    saveSession(sessionRef.current)
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
    setRestoreHeadingId(null)
    setDocRemoved(false)
    setScrollNonce((n) => n + 1)
    if (activeId) {
      sessionRef.current.lastProjectId = activeId
      sessionRef.current.perProject[activeId] = { docPath: r.docPath, headingId: r.headingId || undefined }
      saveSession(sessionRef.current)
    }
  }, [resetDocState, activeId])

  const openDoc = useCallback((path: string) => {
    setDocPath(path)
    resetDocState()
    setScrollToId(null)
    setRestoreHeadingId(null)
    setDocRemoved(false)
    if (activeId) {
      sessionRef.current.lastProjectId = activeId
      sessionRef.current.perProject[activeId] = { docPath: path, headingId: undefined }
      saveSession(sessionRef.current)
    }
  }, [resetDocState, activeId])

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
      setDocRemoved(false)
      resetDocState()
    }
    await refreshProjects()
  }, [activeId, refreshProjects, resetDocState])

  useEffect(() => {
    const el = mainRef.current
    if (!el || !activeId || !docPath) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const onScroll = (): void => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        const headings = Array.from(el.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id]'))
          .map((heading) => ({ id: heading.id, top: heading.offsetTop }))
        const headingId = pickAnchor(headings, el.scrollTop)
        sessionRef.current.lastProjectId = activeId
        sessionRef.current.perProject[activeId] = { docPath, headingId }
        saveSession(sessionRef.current)
      }, 250)
    }
    el.addEventListener('scroll', onScroll)
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (timer) clearTimeout(timer)
    }
  }, [activeId, docPath])

  useEffect(() => {
    return window.api.onIndexChanged(({ projectId, tree: nextTree }) => {
      if (projectId !== activeId) return
      setTree(nextTree)
      if (!docPath) return
      if (treeHasPath(nextTree, docPath)) {
        setRestoreHeadingId(sessionRef.current.perProject[activeId]?.headingId ?? null)
        setDocReloadNonce((nonce) => nonce + 1)
      } else {
        setDocPath(null)
        setDocRemoved(true)
        resetDocState()
      }
    })
  }, [activeId, docPath, resetDocState])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
        if (addOpen || settingsOpen) return
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addOpen, settingsOpen])

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
        <main className="content" data-theme={docTheme} ref={mainRef}>
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
                restoreHeadingId={restoreHeadingId}
                reloadNonce={docReloadNonce}
                onToc={setToc}
                onStats={setStats}
              />
            ) : docRemoved ? (
              <div className="empty-state" data-removed>
                <i className="empty-icon fa-solid fa-file-circle-xmark" aria-hidden="true" />
                <p>This document was removed.</p>
              </div>
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
                focusNonce={refFocusNonce}
              />
            ) : undefined
          }
        />
      )}
      {paletteOpen && !addOpen && !settingsOpen && (
        <CommandPalette
          projects={projects}
          activeId={activeId}
          activeProject={activeProject}
          tree={tree}
          onSelectProject={selectProject}
          onOpenDoc={(path) => { setView('docs'); openDoc(path) }}
          onSwitchRef={() => { setView('docs'); setPaletteOpen(false); setRefFocusNonce((n) => n + 1) }}
          onAddProject={() => setAddOpen(true)}
          onManageProjects={() => setView('manage')}
          onRebuild={rebuild}
          onSettings={() => setSettingsOpen(true)}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {addOpen && <AddProjectModal onAdded={onAdded} onClose={() => setAddOpen(false)} />}
      {settingsOpen && (
        <Settings settings={theme} onChange={setTheme} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  )
}
