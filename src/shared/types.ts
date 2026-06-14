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

// Persisted project record (local-only in this plan).
export type ProjectStatus = 'ok' | 'unavailable' | 'building' | 'error'
export interface Project {
  id: string // UUID
  name: string // editable display label
  type: 'local' // github added in a later plan
  source: string // absolute directory path
  addedAt: string // ISO timestamp
  lastBuiltAt?: string
  docCount?: number
  status: ProjectStatus
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
  removeProject(id: string): Promise<void>
  selectProject(id: string): Promise<{ tree: NavNode[]; docCount: number }>
  getDoc(id: string, relativePath: string): Promise<{ kind: DocKind; content: string }>
  search(id: string, query: string): Promise<SearchResult[]>
  pickDirectory(): Promise<string | null>
}

declare global {
  interface Window {
    api: IpcApi
  }
}
