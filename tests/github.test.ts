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
