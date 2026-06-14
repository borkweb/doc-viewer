import { join } from 'node:path'

// Overridable for tests (Electron's `app` is unavailable outside the Electron runtime).
let baseDir: string | null = null
export function setBaseDir(dir: string): void {
  baseDir = dir
}
export function userDataDir(): string {
  if (baseDir) return baseDir
  // Load Electron lazily so importing this module under `bun test` (where the
  // Electron runtime isn't present) doesn't fail. Tests always set a base dir
  // via setBaseDir(), so they never reach this branch.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron')
  return app.getPath('userData')
}
export function projectsFile(): string {
  return join(userDataDir(), 'projects.json')
}
export function cacheRoot(): string {
  return join(userDataDir(), 'cache')
}
export function projectCacheDir(id: string): string {
  return join(cacheRoot(), id)
}
// Refs may contain '/', ':' etc. encodeURIComponent yields a single safe dir name.
export function refCacheDir(id: string, ref: string): string {
  return join(projectCacheDir(id), encodeURIComponent(ref))
}
