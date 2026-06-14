import { describe, it, expect } from 'bun:test'
import type { Project, GithubProject, LocalProject, RefInfo, BuildProgress } from '../src/shared/types'

describe('types: Project union', () => {
  it('discriminates local vs github by type', () => {
    const local: LocalProject = {
      id: 'a', name: 'x', type: 'local', source: '/tmp/x', addedAt: 'now', status: 'ok'
    }
    const ref: RefInfo = { ref: 'main', lastBuiltAt: 'now', docCount: 3 }
    const gh: GithubProject = {
      id: 'b', name: 'o/r', type: 'github', source: 'https://github.com/o/r',
      refs: [ref], currentRef: 'main', addedAt: 'now', status: 'ok'
    }
    const projects: Project[] = [local, gh]
    const types = projects.map((p) => p.type).sort()
    expect(types).toEqual(['github', 'local'])
    const progress: BuildProgress = { projectId: 'b', ref: 'main', stage: 'cloning' }
    expect(progress.stage).toBe('cloning')
  })
})

import { parseGithubSource, defaultGithubName, githubIdentity } from '../src/main/util/github'

describe('parseGithubSource', () => {
  it('normalizes owner/repo shorthand to an https url', () => {
    const s = parseGithubSource('octocat/Hello-World')
    expect(s).toEqual({ owner: 'octocat', repo: 'Hello-World', url: 'https://github.com/octocat/Hello-World' })
  })
  it('accepts a full https url and strips .git + trailing slash', () => {
    expect(parseGithubSource('https://github.com/octocat/Hello-World.git/').url)
      .toBe('https://github.com/octocat/Hello-World')
  })
  it('accepts http and upgrades to https', () => {
    expect(parseGithubSource('http://github.com/a/b').url).toBe('https://github.com/a/b')
  })
  it('trims surrounding whitespace', () => {
    expect(parseGithubSource('  a/b  ').url).toBe('https://github.com/a/b')
  })
  it('rejects garbage and non-github hosts', () => {
    expect(() => parseGithubSource('not a repo')).toThrow(/GitHub source/i)
    expect(() => parseGithubSource('https://gitlab.com/a/b')).toThrow(/GitHub source/i)
    expect(() => parseGithubSource('')).toThrow(/GitHub source/i)
  })
})

describe('defaultGithubName / githubIdentity', () => {
  it('derives owner/repo, appending the subpath when scoped', () => {
    const s = parseGithubSource('octocat/Hello-World')
    expect(defaultGithubName(s)).toBe('octocat/Hello-World')
    expect(defaultGithubName(s, 'docs')).toBe('octocat/Hello-World /docs')
  })
  it('identity excludes ref but includes source + docsSubpath', () => {
    expect(githubIdentity('https://github.com/o/r', undefined))
      .toBe(githubIdentity('https://github.com/o/r', undefined))
    expect(githubIdentity('https://github.com/o/r', 'docs'))
      .not.toBe(githubIdentity('https://github.com/o/r', undefined))
  })
})
