import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi, BuildProgress } from '../shared/types'

const api: IpcApi = {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  addLocalProject: (source, name) => ipcRenderer.invoke('projects:addLocal', source, name),
  addGithubProject: (source, opts) => ipcRenderer.invoke('projects:addGithub', source, opts),
  removeProject: (id) => ipcRenderer.invoke('projects:remove', id),
  updateProjectSettings: (id, patch) => ipcRenderer.invoke('projects:updateSettings', id, patch),
  rebuildProject: (id) => ipcRenderer.invoke('projects:rebuild', id),
  cancelBuild: (id) => ipcRenderer.invoke('projects:cancelBuild', id),
  listRefs: (id) => ipcRenderer.invoke('projects:listRefs', id),
  switchRef: (id, ref) => ipcRenderer.invoke('projects:switchRef', id, ref),
  addRef: (id, ref) => ipcRenderer.invoke('projects:addRef', id, ref),
  removeRef: (id, ref) => ipcRenderer.invoke('projects:removeRef', id, ref),
  selectProject: (id) => ipcRenderer.invoke('projects:select', id),
  getDoc: (id, relativePath) => ipcRenderer.invoke('projects:getDoc', id, relativePath),
  search: (id, query) => ipcRenderer.invoke('projects:search', id, query),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  openPath: (target) => ipcRenderer.invoke('shell:openPath', target),
  onBuildProgress: (cb) => {
    const handler = (_e: unknown, p: BuildProgress): void => cb(p)
    ipcRenderer.on('build:progress', handler)
    return () => ipcRenderer.removeListener('build:progress', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
