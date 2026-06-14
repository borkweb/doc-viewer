export interface GithubSource {
  owner: string
  repo: string
  url: string // normalized https://github.com/owner/repo
}

const OWNER = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?'
const REPO = '[A-Za-z0-9._-]+?'

function make(owner: string, repo: string): GithubSource {
  const cleanRepo = repo.replace(/\.git$/i, '')
  return { owner, repo: cleanRepo, url: `https://github.com/${owner}/${cleanRepo}` }
}

// Accept a full http(s) github.com URL or the `owner/repo` shorthand.
// SSH-URL input is deferred (spec); private https repos still auth via the
// user's git credential helper at clone time.
export function parseGithubSource(input: string): GithubSource {
  const s = (input ?? '').trim()
  if (!s) throw new Error(`Unrecognized GitHub source: ${JSON.stringify(input)}`)

  const url = new RegExp(`^https?://github\\.com/(${OWNER})/(${REPO})(?:\\.git)?/?$`, 'i')
  const m1 = url.exec(s)
  if (m1) return make(m1[1], m1[2])

  if (!s.includes('://') && !s.startsWith('git@')) {
    const short = new RegExp(`^(${OWNER})/(${REPO})(?:\\.git)?$`)
    const m2 = short.exec(s)
    if (m2) return make(m2[1], m2[2])
  }

  throw new Error(`Unrecognized GitHub source: ${JSON.stringify(input)}`)
}

export function defaultGithubName(src: GithubSource, docsSubpath?: string): string {
  const base = `${src.owner}/${src.repo}`
  const sub = docsSubpath?.trim()
  return sub ? `${base} /${sub.replace(/^\/+|\/+$/g, '')}` : base
}

// Identity excludes the ref (ADR-0002): same repo on two branches = one Project.
export function githubIdentity(url: string, docsSubpath?: string): string {
  return `${url} ${docsSubpath?.trim() || ''}`
}
