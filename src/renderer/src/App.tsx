import { useEffect, useState, useCallback } from 'react'
import type { Project, NavNode, SearchResult } from '@shared/types'
import Sidebar from './components/Sidebar'
import DocView from './components/DocView'

export default function App(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tree, setTree] = useState<NavNode[]>([])
  const [docPath, setDocPath] = useState<string | null>(null)
  const [scrollToId, setScrollToId] = useState<string | null>(null)

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
    <div className="layout">
      <Sidebar
        projects={projects}
        activeId={activeId}
        tree={tree}
        docPath={docPath}
        onSelectProject={selectProject}
        onAddProject={addProject}
        onOpenDoc={openDoc}
        onOpenResult={openResult}
      />
      <main className="content">
        {activeId && docPath ? (
          <DocView projectId={activeId} docPath={docPath} scrollToId={scrollToId} />
        ) : (
          <p className="empty">{activeId ? 'Select a document.' : 'Add or select a project to begin.'}</p>
        )}
      </main>
    </div>
  )
}
