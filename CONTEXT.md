# Doc Viewer

A desktop app for browsing, navigating, and searching documentation drawn from
local directories or GitHub repositories, one selectable Project at a time.

## Language

**Project**:
A named documentation source — a local directory or a GitHub repo — together with
its processed doc set and search index.
_Avoid_: repo (too GitHub-specific), docset (collides with Dash/Zeal), library, source.

**Document**:
A single viewable file surfaced within a Project — a markdown file, or an orphan
HTML file with no markdown sibling. Short form in code: `doc`.
_Avoid_: page (implies routing/pagination), file (too generic — see Source file).

**Source file**:
Any file on disk in a Project's source. Most are not surfaced; the `discover` step
filters Source files down to the subset that become Documents.
_Avoid_: using "file" to mean Document.

**Docs scope**:
The subset of a Project's tree that `discover` considers when the root holds a
top-level `docs/` or `documentation/` folder: root-level Documents plus that
folder's subtree, with all other root subfolders excluded (ADR-0004). Absent such a
folder, the whole tree is in scope. An explicit GitHub `docsSubpath` overrides it.
_Avoid_: conflating with `docsSubpath` (the manual GitHub override).

**Rebuild**:
The operation that re-runs a Project's pipeline (re-acquire source → discover →
parse → index → cache). One internal operation, two surface labels by Project type:
**Pull latest** for GitHub (re-clones and re-fetches remote content), **Reindex**
for local (recovery action; the file-watcher normally keeps local Projects current).
_Avoid_: "refresh" as a user-facing label (ambiguous between the two).

**Section**:
A heading-delimited chunk of a Document (split at H1–H3). The unit of search — each
Section is one search record, and a search result points at one Section's heading
anchor. Content before the first heading is an intro Section anchored to the top.
_Avoid_: chunk, passage, fragment.

**Title**:
A Document's display name — its first H1 heading when present, otherwise a
prettified version of its filename. Distinct from the filename, which is always
used for sort order.
_Avoid_: conflating Title with filename.

**Theme**:
A reusable, named, app-side look — a palette (CSS custom-property overrides) plus
optional content and chrome background images — referenced by id. Applied globally
(default) and optionally overridden per Project for visual distinction. Purely
presentational; never sourced from a Project's repo.
_Avoid_: skin, style; do not conflate with light/dark mode (a Theme may provide
one or both mode variants).

**Ref**:
A git branch, tag, or commit of a GitHub Project's repo. A GitHub Project can hold
several cached Refs and switches between them via the branch switcher; one is the
`currentRef`. Local Projects have no Ref (their content is whatever is on disk).
_Avoid_: branch (a Ref may be a tag or commit too).

## Relationships

- A **Project** has one source: either a local directory or a GitHub repo.
- A **Project** surfaces zero or more **Documents**.
- A **Document** is derived from exactly one **Source file**; not every Source file
  becomes a Document.
- A **Project** whose root has a `docs/` or `documentation/` folder surfaces only
  root-level **Documents** plus that folder's subtree (its **Docs scope**); other
  root subfolders are hidden.
- A **Document** is split into one or more **Sections** at heading boundaries.
- A GitHub **Project** has one or more cached **Refs**, one of which is current; a
  Project's identity excludes its Ref (same repo on two branches = one Project).
- A local **Project** has no **Ref**.

## Example dialogue

> **Dev:** "When I add a GitHub repo on `main` and later add it on `docs-wip`, is
> that two Projects?"
> **Domain expert:** "No — one **Project**. The branch is a **Ref**, and Refs aren't
> part of a Project's identity. You switch Refs inside the Project; each Ref is
> cached separately."
> **Dev:** "And if I 'Reindex' a local Project, does it re-fetch anything?"
> **Domain expert:** "There's nothing to fetch — local content is read live. Reindex
> just rebuilds the in-memory nav tree and Section index. 'Pull latest' is the
> GitHub-only label that actually re-clones."

## Flagged ambiguities

- "doc" vs "document" — resolved: **Document** is canonical; `doc` is the code short
  form only.
- "project" vs "source"/"repo"/"library" — resolved: **Project** is canonical; it is
  not just the source, it includes the processed doc set + index.
- "branch" vs "ref" — resolved: **Ref** is canonical (covers tag/commit, not just
  branch).
- "rebuild"/"refresh" — resolved: **Rebuild** is the internal op; user-facing labels
  are **Pull latest** (GitHub) and **Reindex** (local). "Refresh" is avoided.
- "file" vs "document" — resolved: **Source file** is any on-disk file; only the
  discovered subset are **Documents**.
