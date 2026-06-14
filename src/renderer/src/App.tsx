import { useEffect, useState, useCallback } from 'react'
import type { Project, NavNode, SearchResult } from '@shared/types'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import DocView from './components/DocView'
import Settings from './components/Settings'
import type { TocEntry } from './lib/render'
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

  // Theme: chrome and document themed independently; 'system' follows the OS.
  const [theme, setTheme] = useState<ThemeSettings>(loadThemeSettings)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  const selectProject = useCallback(async (id: string) => {
    setActiveId(id)
    setDocPath(null)
    setToc([])
    const { tree } = await window.api.selectProject(id)
    setTree(tree)
  }, [])

  const addProject = useCallback(async () => {
    const dir = await window.api.pickDirectory()
    if (!dir) return
    const p = await window.api.addLocalProject(dir)
    await refreshProjects()
    await selectProject(p.id)
  }, [refreshProjects, selectProject])

  const openResult = useCallback((r: SearchResult) => {
    setDocPath(r.docPath)
    setToc([])
    setScrollToId(r.headingId || null)
    setScrollNonce((n) => n + 1)
  }, [])

  const openDoc = useCallback((path: string) => {
    setDocPath(path)
    setToc([])
    setScrollToId(null)
  }, [])

  // Jump to a heading in the current doc (e.g. from the Contents menu).
  const jumpTo = useCallback((id: string) => {
    setScrollToId(id)
    setScrollNonce((n) => n + 1)
  }, [])

  const docTitle = docPath ? findDocTitle(tree, docPath) : null

  return (
    <div className="app-shell" data-theme={chromeTheme}>
      <TopBar
        projects={projects}
        activeId={activeId}
        docTitle={docTitle}
        toc={toc}
        onSelectProject={selectProject}
        onAddProject={addProject}
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
      {settingsOpen && (
        <Settings settings={theme} onChange={setTheme} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  )
}
