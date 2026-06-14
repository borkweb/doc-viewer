import { ipcMain, dialog } from 'electron'
import { listProjects, addLocalProject, removeProject } from './registry'
import { selectProject, getDoc, search } from './projectService'

export function registerIpc(): void {
  ipcMain.handle('projects:list', () => listProjects())
  ipcMain.handle('projects:addLocal', (_e, source: string, name?: string) =>
    addLocalProject(source, name)
  )
  ipcMain.handle('projects:remove', (_e, id: string) => removeProject(id))
  ipcMain.handle('projects:select', (_e, id: string) => selectProject(id))
  ipcMain.handle('projects:getDoc', (_e, id: string, relativePath: string) =>
    getDoc(id, relativePath)
  )
  ipcMain.handle('projects:search', (_e, id: string, query: string) => search(id, query))
  ipcMain.handle('dialog:pickDirectory', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })
}
