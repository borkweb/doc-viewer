# DECISIONS

A running log of the decision points encountered while proceeding through the
Curator roadmap (Plans 3 → 4 → 5), the arguments weighed, and the call made.

Decisions are resolved one of two ways:
- **User** — confirmed directly by the maintainer (during interactive design review).
- **Council** — resolved autonomously via a `/council` multi-perspective assessment
  (per the session goal: don't prompt the user; convene a council and decide).

Each entry: the decision, the options considered, the key arguments, and the call.

---

## Plan 3 — Manage Projects view

### Design review (resolved with the maintainer, 2026-06-14)

| # | Decision | Options | Call | Why |
|---|----------|---------|------|-----|
| D3-1 | Row controls visibility | Always-visible vs hover/focus-reveal | **Always-visible** (User) | Discoverability + keyboard/screen-reader affordance beat at-rest cleanliness for a handful of rows. |
| D3-2 | Delete confirmation | Inline two-step vs modal dialog | **Inline two-step** (User) | Subtraction default; no dialog stacking; clear copy ("Delete <name>?") carries the weight for a low-stakes local action. |
| D3-3 | Per-project theme control form | Compact select vs Settings `.segmented` | **Compact select** (User) | Row already carries rename + docsSubpath + delete; a 4-button segmented per row is too wide. Density wins. |
| D3-4 | Mutating a project during its in-flight build | Disable row controls vs allow cancel-then-apply | **Disable while `status==='building'`** (User) | Edge-case paranoia: no mutation mid-rebuild; builds are short; reuses the existing status. |
| D3-5 | Sort/filter the list | Defer to TODO vs build now | **Build now in Plan 3** (User) | Scannability at scale; cheap client-side work; avoids a follow-up. |

_Implementation-plan and engineering-review decisions for Plan 3 are appended below as they are made._

---
