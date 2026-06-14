import { useEffect, useState, useCallback } from 'react'
import type { Project, NavNode, SearchResult } from '@shared/types'
import Sidebar from './components/Sidebar'
import DocView from './components/DocView'
import Settings from './components/Settings'
import {
  loadThemeSettings,
  saveThemeSettings,
  resolveTheme,
  type ThemeSettings
} from './lib/theme'

export default function App(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tree, setTree] = useState<NavNode[]>([])
  const [docPath, setDocPath] = useState<string | null>(null)
  const [scrollToId, setScrollToId] = useState<string | null>(null)

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
    setScrollToId(r.headingId || null)
  }, [])

  const openDoc = useCallback((path: string) => {
    setDocPath(path)
    setScrollToId(null)
  }, [])

  return (
    <div className="layout" data-theme={chromeTheme}>
      <Sidebar
        projects={projects}
        activeId={activeId}
        tree={tree}
        docPath={docPath}
        onSelectProject={selectProject}
        onAddProject={addProject}
        onOpenDoc={openDoc}
        onOpenResult={openResult}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main className="content" data-theme={docTheme}>
        <div className="content-inner">
          {activeId && docPath ? (
            <DocView projectId={activeId} docPath={docPath} scrollToId={scrollToId} />
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
      {settingsOpen && (
        <Settings settings={theme} onChange={setTheme} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  )
}
