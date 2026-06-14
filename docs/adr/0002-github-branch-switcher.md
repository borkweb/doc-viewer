# GitHub Projects use a branch switcher with per-ref caching; ref is not part of identity

A GitHub Project is identified by `(normalized source URL, docsSubpath)` — the
**ref is deliberately excluded from identity**. A single GitHub Project can hold
several refs (branches/tags/commits), each cached independently under
`cache/<projectId>/<ref>/`, and the user switches between them with a branch
switcher; one ref is the `currentRef`. Local Projects have no ref dimension — their
content is whatever is on disk.

We chose one-Project-with-a-switcher over one-Project-per-branch because the
branches of a repo are the *same* documentation source viewed at different points,
not separate sources. Collapsing them keeps the project dropdown uncluttered and
lets cached refs coexist so switching is instant; switching to an uncached ref
triggers a build for just that ref.

## Considered Options

- **Two Projects per branch** (identity includes ref) — simpler model, no switcher,
  but every branch you look at becomes another dropdown entry and the shared repo is
  re-cloned per entry. Rejected.

## Consequences

- Cache is keyed per ref; `Project.refs` tracks each cached ref's `lastBuiltAt` and
  `docCount`, with `currentRef` selecting the active one.
- "Pull latest" refreshes only the current ref.
- The identity rule means re-adding the same `(source, docsSubpath)` switches to the
  existing Project (and may offer to add the typed ref) rather than duplicating.
