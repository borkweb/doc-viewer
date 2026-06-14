import { describe, it, expect } from 'bun:test'
import { score } from '../src/renderer/src/lib/fuzzy'

describe('fuzzy score', () => {
  it('returns 0 for a non-subsequence and for an empty query', () => {
    expect(score('xyz', 'ab')).toBe(0)
    expect(score('', 'anything')).toBe(0)
  })

  it('ranks a prefix match above the same query buried mid-string', () => {
    expect(score('arch', 'Architecture')).toBeGreaterThan(score('arch', 'search'))
  })

  it('ranks a contiguous match above a scattered subsequence', () => {
    expect(score('ab', 'ab')).toBeGreaterThan(score('ab', 'a-x-b'))
  })

  it('ranks an exact match highest among its peers', () => {
    expect(score('ipc', 'ipc')).toBeGreaterThan(score('ipc', 'ipc channels'))
    expect(score('ipc', 'ipc channels')).toBeGreaterThan(score('ipc', 'principal'))
  })

  it('rewards word-boundary (initialism) matches', () => {
    expect(score('ar', 'api-reference')).toBeGreaterThan(score('ar', 'cellar'))
  })
})
