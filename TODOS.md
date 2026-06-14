# TODOS

Deferred work, captured during the 2026-06-14 plan-deep-review. See the spec at
`docs/superpowers/specs/2026-06-14-doc-viewer-design.md`.

## P3 — Per-project "trusted" toggle

**What:** Let a project opt out of the untrusted-content hardening so your own docs
render with full fidelity.

**Why:** v1 sanitizes all markdown with DOMPurify and runs mermaid in
`securityLevel: 'strict'` because projects can be arbitrary GitHub repos. For your
own trusted docs that intentionally embed raw HTML or interactive mermaid, that
sanitization can strip legitimate content.

**Context:** Add a `trusted: boolean` field to the project registry entry. When
true, skip DOMPurify and use a looser mermaid security level for that project's
docs. Surface as a per-project setting toggle. Keep the default `false` (safe).
Touch points: `registry.ts` (field), `renderer/lib/render.ts` (conditional
sanitize/mermaid config), project settings UI.

**Effort:** S · **Priority:** P3 · **Depends on:** core viewer + registry shipped.

---

## Plan 1 review follow-ups (from final review, 2026-06-14)

- **P3 — Setext heading support.** `parse.ts` is ATX-only (`#`-style); setext headings (`===`/`---`) aren't indexed as Sections so they're not searchable. (The raw-vs-rendered slug mismatch was fixed in `fix(slug)`; only setext support remains deferred.)
- **P2 — Render the sticky TOC** from `buildToc` (currently computed but discarded).
- **P2 — Surface `removeProject` + a Reindex action** in the UI (wired/tested but no caller).
- **P2 — Project status transitions:** mark `unavailable`/`error` when a local source dir is missing (today `discover` swallows it and reports `docCount: 0`).
- **P3 — Observability:** `userData/logs/` structured log + in-UI build summary (wire up the `skipped` data `discoverDetailed` already computes).
- **P3 — Tests:** `enhanceDiagrams`/mermaid-error escaping, `buildToc` anchor parity, iframe sandbox, discover caps, and a Playwright-Electron launch smoke.
- **P3 — Remove or consume `active.docs`** in `projectService` (currently dead state).

## Phase 2 candidates (documented in spec "NOT in scope")

- **Cross-project global search (E1)** — P2, M. Search all projects via a combined
  index.
- **Export doc to standalone HTML (E6)** — P3, S. Reuse the `build-db-html.mjs`
  output for a one-click self-contained export.
- **Wiki-link / backlink doc graph** — future, L.
- **Code-signing / notarization / auto-update** — only if the app is distributed.
