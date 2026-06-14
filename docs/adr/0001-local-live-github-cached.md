# Local Projects read live; GitHub Projects are cloned, cached, then the clone is deleted

A Project's read path depends on its type. **Local** Projects read Documents live
from disk and use a file-watcher to auto-refresh, so the on-disk source is always
the source of truth. **GitHub** Projects are cloned shallowly to a temp dir,
processed into a per-project cache (Documents + nav tree + search index), after
which **the clone is deleted** and the app serves entirely from the cache; the only
way to get newer content is an explicit Rebuild ("Pull latest"), which re-clones.

We chose this because the two source types have genuinely different lifecycles: a
local directory is something you actively edit and expect to see change instantly,
while a remote repo is a snapshot you pull on demand. Caching the GitHub result lets
the app work fully offline without leaving clones (and their full code trees) lying
around on disk.

## Considered Options

- **Retain GitHub clones and `git pull` to refresh** — simpler conceptually (one
  read path for both types, trivial freshness) but keeps entire repos on disk, and
  conflates "code checkout" with "doc source." Rejected to keep disk usage bounded
  and the two source types cleanly separated.

## Consequences

- `Project.type` explicitly branches the `getDoc`/build read path.
- GitHub Documents are frozen between Rebuilds; the UI labels the GitHub Rebuild
  "Pull latest" to make the re-fetch obvious.
- The cache is load-bearing for GitHub Projects, so it carries a `cacheVersion` and
  is written atomically (temp dir + rename).
