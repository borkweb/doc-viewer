# A root `docs`/`documentation` folder scopes discovery to it + root-level files

When a Project's root contains a top-level folder named `docs` or `documentation`
(case-insensitive; both are included if both exist), the `discover` step is scoped
to: doc files (`.md`/`.html`) sitting **directly in the root**, plus everything
recursively under the matched folder(s). All other root-level subfolders (`src/`,
`adr/`, `packages/`, …) are excluded — they are not walked at all, and each gets a
single `skipped` entry (`"outside docs/ scope"`) for observability. When no such
folder exists, discovery walks the whole tree as before (minus `IGNORE_DIRS`). The
existing symlink-skip, 2 MB/file cap, 5000-doc cap, and 1A `.html`/`.md` dedup all
still apply within the scoped set.

We chose this because real repos bury their actual documentation in a `docs/`
folder amid a lot of incidental markdown — `src/` READMEs, package-level notes,
ADR scratch files, vendored markdown. Surfacing every `.md` in the tree drowns the
real docs in noise; scoping to the conventional docs folder (plus the top-level
files a reader expects, like `README.md`) shows the documentation a project
actually intends to publish.

## Considered Options

- **Always show all markdown in the tree** (the prior behavior, kept as the
  no-docs-folder fallback) — simplest and fully general, but noisy for any repo
  that follows the `docs/` convention: incidental READMEs and notes crowd out the
  curated docs. Rejected as the default when a docs folder is present.

## Consequences

- Markdown in other root subfolders is **intentionally hidden** when a `docs/` or
  `documentation/` folder exists; that is the point, not a bug.
- An explicit GitHub `docsSubpath` setting **overrides** this auto-detection and
  confines discovery to the configured subpath.
- Detection is purely structural (a top-level dir name), so it needs no config and
  applies equally to local and GitHub Projects.
