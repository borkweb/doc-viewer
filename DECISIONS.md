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

### Engineering deep-review (resolved via dual council — Claude subagent `/bork:council` + Codex `codex exec`, 2026-06-14)

Deep-review verdict: **READY-WITH-FIXES (7/10)**. Four decision points were each put to two independent councils; both converged on option **(b)** for all four, and jointly overrode the reviewer's softer recommendation on DP2 and DP4 with concrete reasoning.

| # | Decision point | Claude council | Codex council | Call |
|---|----------------|----------------|---------------|------|
| D3-6 | DP1 — refresh after re-scoping the **active** project (open doc may vanish) | (b) + preserve docPath if still in tree | (b) | **(b) + preserve-if-present**: `setTree`; if the open `docPath` survives the new scope keep it, else clear `docPath` + reset doc state. Avoids a dangling `getDoc` "not in cache" throw. |
| D3-7 | DP2 — backend guard vs UI disable for concurrent same-id builds | (b) guard (tagged error) | (b) guard | **(b)**: `setDocsSubpath` throws a tagged `build-in-progress` error when `inFlight.has(id)`. Closes a real race (overwriting the `inFlight` controller orphans a live build; `cancelBuild` can't reach it). UI disable alone is too weak. Scoped to the new entrypoint; guarding the older `switchRef`/`rebuildProject` is a noted follow-up. |
| D3-8 | DP3 — error-copy mapping for `setDocsSubpath` rejections | (b) branch (prefer code) | (b) branch | **(b)**: branch on the tagged collision error → collision copy; any other failure (incl. build-in-progress) → generic "Couldn't rebuild at that subpath." |
| D3-9 | DP4 — App-integration test coverage | (b) scoped to delete-active | (b) | **(b) scoped**: add ONE focused App-level jsdom test for **delete-active** (highest-risk silent regression); leave the rest on the manual-smoke checklist. |

Adopted plan corrections (straight bugs from the deep review — no council needed):
- **MF1** — `setDocsSubpath` must not clobber the module-level `active` when editing a **non-active** project: guard `if (active?.id === id)` like `rebuildProject`; otherwise derive the return from `readCache` without touching `active`.
- **MF2** — move the `IpcApi.setDocsSubpath` addition out of Task 1 into Task 3 (with the preload impl) so Task 1 typechecks.
- **MF3** — narrowing `themeId` to `ThemeChoice` requires updating `ipc.ts`'s `projects:updateSettings` handler param type in Task 1 (else the node typecheck breaks).

---
