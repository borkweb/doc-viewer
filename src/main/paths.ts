import { app } from 'electron'
import { join } from 'node:path'

// Overridable for tests (Electron's `app` is unavailable in vitest).
let baseDir: string | null = null
export function setBaseDir(dir: string): void {
  baseDir = dir
}
export function userDataDir(): string {
  if (baseDir) return baseDir
  return app.getPath('userData')
}
export function projectsFile(): string {
  return join(userDataDir(), 'projects.json')
}
