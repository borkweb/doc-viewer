export interface DocAnchor {
  docPath: string
  headingId?: string
}

export interface SessionState {
  lastProjectId?: string
  perProject: Record<string, DocAnchor>
}

const STORAGE_KEY = 'curator.session'

function isAnchor(value: unknown): value is DocAnchor {
  if (typeof value !== 'object' || value === null) return false
  const anchor = value as Record<string, unknown>
  if (typeof anchor.docPath !== 'string' || anchor.docPath === '') return false
  if (anchor.headingId !== undefined && typeof anchor.headingId !== 'string') return false
  return true
}

export function loadSession(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { perProject: {} }
    const parsed = JSON.parse(raw) as Partial<SessionState>
    const perProject: Record<string, DocAnchor> = {}
    const source = parsed?.perProject
    if (source && typeof source === 'object') {
      for (const [id, anchor] of Object.entries(source)) {
        if (isAnchor(anchor)) perProject[id] = { docPath: anchor.docPath, headingId: anchor.headingId }
      }
    }
    const lastProjectId = typeof parsed?.lastProjectId === 'string' ? parsed.lastProjectId : undefined
    return { lastProjectId, perProject }
  } catch {
    return { perProject: {} }
  }
}

export function saveSession(state: SessionState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Session memory is non-critical; ignore unavailable storage/quota errors.
  }
}

export function pickAnchor(headings: { id: string; top: number }[], scrollTop: number): string | undefined {
  let best: string | undefined
  for (const heading of headings) {
    if (!heading.id) continue
    if (heading.top <= scrollTop + 1) best = heading.id
    else break
  }
  return best
}
