export interface DocAnchor {
  docPath: string
  headingId?: string
}

export interface SessionState {
  lastProjectId?: string
  perProject: Record<string, DocAnchor>
}

export function loadSession(): SessionState {
  return { perProject: {} }
}

export function saveSession(_state: SessionState): void {
  // Contract stub; behavior lands in the E3 session slice.
}

export function pickAnchor(_headings: { id: string; top: number }[], _scrollTop: number): string | undefined {
  return undefined
}
