import { ipcMain, dialog, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { BuildProgress, ThemeChoice } from '@shared/types'
import { listProjects, addLocalProject, removeProject, updateProject } from './registry'
import {
  selectProject, getDoc, search,
  addGithubProject, rebuildProject, cancelBuild,
  listRefs, switchRef, addRef, removeRef
} from './projectService'
import { purgeProjectCache } from './cache'

export function registerIpc(): void {
  const progressTo = (e: IpcMainInvokeEvent) => (p: BuildProgress): void => {
    if (!e.sender.isDestroyed()) e.sender.send('build:progress', p)
  }

  ipcMain.handle('projects:list', () => listProjects())
  ipcMain.handle('projects:addLocal', (_e, source: string, name?: string) =>
    addLocalProject(source, name)
  )
  ipcMain.handle(
    'projects:addGithub',
    (e, source: string, opts?: { name?: string; ref?: string; docsSubpath?: string }) =>
      addGithubProject(source, opts ?? {}, progressTo(e))
  )
  ipcMain.handle('projects:remove', async (_e, id: string) => {
    await purgeProjectCache(id) // remove derived cache (no-op for local)
    await removeProject(id)
  })
  ipcMain.handle(
    'projects:updateSettings',
    (_e, id: string, patch: { name?: string; docsSubpath?: string; themeId?: ThemeChoice }) =>
      updateProject(id, patch)
  )
  ipcMain.handle('projects:rebuild', (e, id: string) => rebuildProject(id, progressTo(e)))
  ipcMain.handle('projects:cancelBuild', (_e, id: string) => cancelBuild(id))
  ipcMain.handle('projects:listRefs', (_e, id: string) => listRefs(id))
  ipcMain.handle('projects:switchRef', (e, id: string, ref: string) =>
    switchRef(id, ref, progressTo(e))
  )
  ipcMain.handle('projects:addRef', (e, id: string, ref: string) =>
    addRef(id, ref, progressTo(e))
  )
  ipcMain.handle('projects:removeRef', (_e, id: string, ref: string) => removeRef(id, ref))
  ipcMain.handle('projects:select', (_e, id: string) => selectProject(id))
  ipcMain.handle('projects:getDoc', (_e, id: string, relativePath: string) =>
    getDoc(id, relativePath)
  )
  ipcMain.handle('projects:search', (_e, id: string, query: string) => search(id, query))
  ipcMain.handle('dialog:pickDirectory', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })
  // Reveal a local path in the OS file browser (status-bar project link).
  ipcMain.handle('shell:openPath', async (_e, target: string) => {
    await shell.openPath(target)
  })
}
