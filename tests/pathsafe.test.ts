import { describe, it, expect } from 'bun:test'
import { resolve } from 'node:path'
import { safeResolve } from '../src/main/util/pathsafe'

const root = resolve('tests/fixtures/sample-docs')

describe('safeResolve', () => {
  it('resolves a normal relative path', () => {
    expect(safeResolve(root, 'db.md')).toBe(resolve(root, 'db.md'))
  })

  it('rejects parent traversal', () => {
    expect(() => safeResolve(root, '../../etc/passwd')).toThrow(/outside project/i)
  })

  it('rejects absolute paths', () => {
    expect(() => safeResolve(root, '/etc/passwd')).toThrow(/outside project/i)
  })
})
