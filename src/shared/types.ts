// Discovered viewable file kinds.
export type DocKind = 'md' | 'html'

// A node in the navigation tree (folder or document).
export interface NavFolder {
  type: 'folder'
  name: string
  path: string // relative path of the folder from the project root
  children: NavNode[]
}
export interface NavDoc {
  type: 'doc'
  name: string // filename, e.g. "03-domain-model.md"
  title: string // H1 or prettified filename
  path: string // relative path from the project root
  kind: DocKind
}
export type NavNode = NavFolder | NavDoc

// A heading-delimited chunk of a Document — the unit of search.
export interface Section {
  id: string // `${docPath}#${headingId}` (stable per doc)
  docPath: string
  docTitle: string
  headingId: string // slug anchor, '' for the intro section
  headingText: string // '' for the intro section
  depth: number // 1..3, 0 for intro
  text: string // markdown-stripped plain text of the section body
}

// A parsed Document with its metadata and sections.
export interface ParsedDoc {
  path: string // relative from project root
  name: string
  kind: DocKind
  title: string
  sections: Section[]
}

// Persisted project records. `type` discriminates the union.
// Per-region theme selection vocabulary. Single source of truth (the renderer's
// lib/theme re-exports this). 'system' follows the OS via prefers-color-scheme.
export type ThemeChoice = 'dark' | 'light' | 'system'
export const THEME_CHOICES: readonly ThemeChoice[] = ['dark', 'light', 'system']

export type ProjectStatus = 'ok' | 'unavailable' | 'building' | 'error'

interface ProjectBase {
  id: string // UUID
  name: string // editable display label
  addedAt: string // ISO timestamp
  status: ProjectStatus
  themeId?: string // per-project theme id (registry id; absent = use global). Plan 5 widened from ThemeChoice.
}

export interface LocalProject extends ProjectBase {
  type: 'local'
  source: string // absolute directory path
  lastBuiltAt?: string
  docCount?: number
}

// One cached ref of a GitHub Project (branch/tag/commit). ADR-0002.
export interface RefInfo {
  ref: string
  lastBuiltAt: string
  docCount: number
}

export interface GithubProject extends ProjectBase {
  type: 'github'
  source: string // normalized https://github.com/owner/repo
  docsSubpath?: string // overrides docs-folder auto-scoping (ADR-0004); part of identity (ADR-0002)
  refs: RefInfo[] // cached refs
  currentRef: string // selected ref; '' only transiently during first build
}

export type Project = LocalProject | GithubProject

// A patch accepted by registry.updateProject — partial of either variant.
export type ProjectPatch = Partial<Omit<LocalProject, 'id' | 'type'>> &
  Partial<Omit<GithubProject, 'id' | 'type'>>

// Pipeline progress streamed to the renderer during a github build.
export type BuildStage =
  | 'cloning'
  | 'resolving'
  | 'discovering'
  | 'parsing'
  | 'indexing'
  | 'caching'
  | 'cleanup'
  | 'done'
  | 'error'
export interface BuildProgress {
  projectId: string
  ref: string
  stage: BuildStage
  message?: string
  docCount?: number
  skipped?: number
}

// Pushed main -> renderer after a live reindex of the active local project.
export interface IndexChanged {
  projectId: string
  tree: NavNode[]
  docCount: number
}

// A search hit (per Section).
export interface SearchResult {
  docPath: string
  docTitle: string
  headingId: string
  headingText: string
  snippet: string
  score: number
}

// The typed surface exposed on window.api by the preload bridge.
export interface IpcApi {
  listProjects(): Promise<Project[]>
  addLocalProject(source: string, name?: string): Promise<Project>
  addGithubProject(
    source: string,
    opts?: { name?: string; ref?: string; docsSubpath?: string }
  ): Promise<Project>
  removeProject(id: string): Promise<void>
  updateProjectSettings(
    id: string,
    patch: { name?: string; docsSubpath?: string; themeId?: string }
  ): Promise<Project>
  rebuildProject(id: string): Promise<void> // "Pull latest" (github) / "Reindex" (local)
  setDocsSubpath(id: string, subpath: string): Promise<{ tree: NavNode[]; docCount: number }>
  cancelBuild(id: string): Promise<void>
  listRefs(id: string): Promise<RefInfo[]>
  switchRef(id: string, ref: string): Promise<{ tree: NavNode[]; docCount: number }>
  addRef(id: string, ref: string): Promise<{ tree: NavNode[]; docCount: number }>
  removeRef(id: string, ref: string): Promise<void>
  selectProject(id: string): Promise<{ tree: NavNode[]; docCount: number }>
  getDoc(id: string, relativePath: string): Promise<{ kind: DocKind; content: string }>
  search(id: string, query: string): Promise<SearchResult[]>
  pickDirectory(): Promise<string | null>
  openPath(target: string): Promise<void>
  onBuildProgress(cb: (p: BuildProgress) => void): () => void // returns unsubscribe
  onIndexChanged(cb: (p: IndexChanged) => void): () => void // returns unsubscribe
}

declare global {
  interface Window {
    api: IpcApi
  }
}
