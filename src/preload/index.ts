import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi } from '../shared/types'

const api: IpcApi = {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  addLocalProject: (source, name) => ipcRenderer.invoke('projects:addLocal', source, name),
  removeProject: (id) => ipcRenderer.invoke('projects:remove', id),
  selectProject: (id) => ipcRenderer.invoke('projects:select', id),
  getDoc: (id, relativePath) => ipcRenderer.invoke('projects:getDoc', id, relativePath),
  search: (id, query) => ipcRenderer.invoke('projects:search', id, query),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory')
}

contextBridge.exposeInMainWorld('api', api)
