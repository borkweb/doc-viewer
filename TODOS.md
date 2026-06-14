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

## Phase 2 candidates (documented in spec "NOT in scope")

- **Cross-project global search (E1)** — P2, M. Search all projects via a combined
  index.
- **Export doc to standalone HTML (E6)** — P3, S. Reuse the `build-db-html.mjs`
  output for a one-click self-contained export.
- **Wiki-link / backlink doc graph** — future, L.
- **Code-signing / notarization / auto-update** — only if the app is distributed.
