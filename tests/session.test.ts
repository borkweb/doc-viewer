import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { loadSession, saveSession, pickAnchor, type SessionState } from '../src/renderer/src/lib/session'
import { stubLocalStorage } from './helpers/localStorage'

// Deterministic in-memory localStorage (setup-dom.ts does not register one); the
// afterEach teardown restores the original global so the stub never leaks.
let restoreLs: () => void
beforeEach(() => { restoreLs = stubLocalStorage() })
afterEach(() => { restoreLs() })

describe('session load/save', () => {
  it('returns an empty state when nothing is stored', () => {
    expect(loadSession()).toEqual({ perProject: {} })
  })

  it('returns an empty state for malformed JSON', () => {
    localStorage.setItem('curator.session', '{ not json')
    expect(loadSession()).toEqual({ perProject: {} })
  })

  it('round-trips lastProjectId and per-project anchors', () => {
    const s: SessionState = { lastProjectId: 'p1', perProject: { p1: { docPath: 'a.md', headingId: 'intro' } } }
    saveSession(s)
    expect(loadSession()).toEqual(s)
  })

  it('drops malformed per-project entries but keeps valid ones', () => {
    localStorage.setItem('curator.session', JSON.stringify({
      lastProjectId: 7,
      perProject: {
        good: { docPath: 'a.md' },
        noPath: { headingId: 'x' },
        badHeading: { docPath: 'b.md', headingId: 9 }
      }
    }))
    const out = loadSession()
    expect(out.lastProjectId).toBeUndefined()
    expect(out.perProject).toEqual({ good: { docPath: 'a.md', headingId: undefined } })
  })
})

describe('pickAnchor', () => {
  const headings = [
    { id: 'one', top: 0 },
    { id: 'two', top: 100 },
    { id: 'three', top: 200 }
  ]
  it('picks the nearest heading at or above the scroll top', () => {
    expect(pickAnchor(headings, 150)).toBe('two')
    expect(pickAnchor(headings, 200)).toBe('three')
  })
  it('returns undefined when scrolled above the first heading', () => {
    expect(pickAnchor([{ id: 'one', top: 50 }], 0)).toBeUndefined()
  })
  it('ignores headings without an id', () => {
    expect(pickAnchor([{ id: '', top: 0 }, { id: 'real', top: 10 }], 20)).toBe('real')
  })
})
