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

**Build & verdict (Codex offload, architect-judged 2026-06-14):** implementation offloaded to a Codex builder (architect/builder split via `/bork:offload`); 9 commits on `plan-3-manage-projects`. Architect re-ran every frozen gate RAW: `bun test` 115 pass / 0 fail, `bun run typecheck` exit 0, `bunx electron-vite build` exit 0; spot-checked the council invariants in code (build-in-progress guard, `active?.id===id` guards, self-excluding collision, error branching). **Verdict: ACCEPT.** Merged to `main` (4b5d7d5) and pushed.

---

## Plan 4 — File-watch (E2) · Session memory (E3) · Command palette (E4)

### Scope & decisions (resolved via dual council — Claude `/bork:council` + Codex, 2026-06-14)

Both councils independently endorsed the full lead slate (9/9). Decomposition: **one Plan 4, three independently-shippable slice-PRs, build order E3 → E4 → E2** (E3 settles the renderer persistence seam; E4 is pure-renderer; E2 last — isolated but platform-risky, and manual Reindex already exists as a fallback).

| # | Decision | Call | Why |
|---|----------|------|-----|
| D4-1 | File-watch recursion (E2) | **`fs.watch(root,{recursive:true})` + Linux-degradation note** | darwin-primary target; can't vendor chokidar (no-install); hand-rolled per-dir watch is handle-cost complexity for a non-target OS. Manual Reindex remains. |
| D4-2 | Reindex granularity (E2) | **Debounced full reindex (~300ms trailing, leading-edge suppressed)** | Reuses the tested `selectLocal` path; incremental patching is premature. Collapses atomic-save bursts (editors fire `rename`, FSEvents coalesces). |
| D4-3 | Open doc changes/deletes under watch (E2, UX) | **Silent re-render on change (preserve scroll, debounced) + gentle "This document was removed." notice on delete-of-open** | Matches "always fresh"; a silent delete would feel broken. |
| D4-4 | Session persistence location (E3) | **Renderer `localStorage` (`lib/session.ts`)** | Matches the existing theme persistence; zero IPC; scroll updates are high-frequency. Main `userData/session.json` + settings IPC noted as a future consolidation. |
| D4-5 | Session scope (E3, UX) | **Project + last doc + scroll, per project — scroll restore best-effort via nearest-heading anchor (not raw pixel offset), fail-soft silent** | Both councils flagged that E2's live re-render invalidates a saved pixel offset; a heading anchor is resilient and reuses existing anchor machinery. Degrade to project+doc acceptable if it proves fragile. |
| D4-6 | Restore-on-launch (E3, UX) | **Auto-restore, guarded fail-soft** to home/Manage covering: project missing/unavailable, doc gone from tree, build stale/in-progress, first-run | Auto-restore is the product promise; guard must cover all four cases (not just "project missing"). |
| D4-7 | Palette scope v1 (E4, UX) | **Projects + current-project docs + commands (tiers 1-2); defer cross-project cached github docs** | Tiers 1-2 are already in renderer state; tier 3 needs a new manifest-enumeration IPC for speculative value. |
| D4-8 | Palette keybinding (E4) | **Renderer App-level `keydown` ⌘K/Ctrl+K, `preventDefault`, composes with existing Escape handlers, fires from input fields** | `globalShortcut` is system-wide (fires unfocused) — wrong for an in-app palette. First app-level key handler — mind Escape precedence with Settings/Add/Manage modals. |

### Command-palette design review (resolved via dual council, 2026-06-14)

Design review hardened the palette spec (hierarchy, states, motion, keyboard/a11y, verbatim copy, AI-slop guardrails) and surfaced four UX forks. Both councils endorsed all four leads.

| # | Decision | Call | Why |
|---|----------|------|-----|
| D4-9 | Empty-query state (before typing) | **(c) Projects + commands; documents appear only after typing** — plus a muted hint "Type to search documents…" | Predictable launcher, no recency dependency; a big project's doc list won't swamp the panel; the hint teaches the affordance. (Recents-based empty state is a fast-follow once E3 tracks per-project recency.) |
| D4-10 | "Switch ref…" command shape | **(a) Open the existing BranchSwitcher** (palette closes) | Reuses tested UI; inline ref sub-items would invent nested palette navigation for a single command. |
| D4-11 | Fuzzy-match highlighting | **(b) Rank-only first cut; `<mark>` highlight deferred** — keep the scorer prefix/contiguity-favoring so rank-only stays obvious | Keeps `lib/fuzzy.ts` returning a single score (no match-index bugs); promote highlight to launch only if matching proves loose. |
| D4-12 | Documents-tier overflow | **(a) Hard cap ~50 by score + muted "…and N more — keep typing"** | One bounded line, no windowing dep, nudges narrowing; a palette is a narrowing tool, not a 1000-row browser. |

### Engineering deep-review (resolved via dual council, 2026-06-14)

Deep-review verdict: **READY-WITH-FIXES (7/10)** — 5 concrete must-fix bugs (adopted as bug fixes) + 3 implementation-approach decision points (dual-councilled). Notably, both councils **independently corrected the lead** on DR-DP1.

| # | Decision | Call | Why |
|---|----------|------|-----|
| D4-13 | DR-DP1 — make the reindex active-project guard actually hold | **Generation token that gates `selectLocal`'s `active=` WRITE itself** (not merely the post-await reindex commit) — merges reviewer options (a)+(b) | Both councils flagged that the corruption is the unconditional `active={...}` inside `selectLocal`; a token checked only after `await selectLocal(A)` still clobbers `active` to A while the UI shows B. Mutex rejected (serializes the hot path). |
| D4-14 | DR-DP2 — watcher teardown on window `'closed'` | **Export `stopWatch()`/teardown from projectService, call in `'closed'`; idempotent + throw-safe (`try/catch` on `.close()`)** | macOS keeps the process alive on window-all-closed, so "rely on process death" leaks the `fs.watch` handle and stacks duplicate watchers across reopen. |
| D4-15 | DR-DP3 — localStorage test-stub lifecycle | **Shared `stubLocalStorage()` helper with `afterEach` teardown that saves & restores the original property descriptor** (not a blind `delete`) | Avoids order-dependent test flakes from a leaked `globalThis.localStorage`; descriptor restore is safe if a real one ever exists. |

Adopted must-fix bugs (from the deep review — straight defects, folded into the plan):
- **MF1 (E2.3)** reindex `active`-corruption race → fixed by D4-13 (gen-token gating the write + re-check `watchedId` after await).
- **MF2 (index.ts)** `fs.watch` handle leak on window `'closed'` → D4-14 explicit teardown.
- **MF3 (projects:remove)** deleting the active local project never stops its watcher → add `releaseIfActive(id)` in projectService (`if (active?.id===id){ stopWatch(); active=null }`) called from the remove handler.
- **MF4 (E4.4)** opening a doc/jumping from the palette while in Manage view renders it behind Manage → the palette's open-doc/switch-ref paths must `setView('docs')` (mirror `selectProject`).
- **MF5 (E3.3)** launch/restore effect double-fires under React.StrictMode (dev) → guard with a `didRunRef` latch so restore runs once (also defuses MF1's dev-time trigger).
- Cheap nice-to-haves folded: lazy `useState(loadSession)`; destructure palette `useMemo` deps. (Jump-vs-restore precedence + watcher-error surfacing noted as acceptable v1.)

**Build & verdict (Codex offload, architect-judged 2026-06-14):** implementation offloaded to a Codex builder, slices E3 → E4 → E2 (15 commits, contract-freeze base). Architect re-ran every frozen gate RAW: `bun test` 166 pass / 0 fail, `bun run typecheck` exit 0, `bunx electron-vite build` exit 0; spot-checked the council invariants in code: MF1 generation token gates `selectLocal`'s `active=` write (projectService.ts:115-128), MF2 `stopWatch()` on window `'closed'`, MF3 `releaseIfActive(id)` in `projects:remove`, MF4 palette `onOpenDoc`/`onSwitchRef` call `setView('docs')`, MF5 `didRunRef` launch latch. Disagreements D1 (contract-freeze commit) / D2 (keep the generation token module-private — correct; the "export a token" wording was loose) / D3 (handoff CLI path) all ACCEPTED. G5 transiently failed because an out-of-band Plan 5 docs commit polluted the branch; the builder backed up the history and rebased to slice-purity, so G5 passed on re-judge. **Verdict: ACCEPT.** Merged to `main` and pushed.

---

## Plan 5 — Theming editor

### Scope & decisions (resolved via dual council — Claude `/bork:council` + design-system + Codex, 2026-06-14)

Both councils converged on a **preset-first theme library** built on a token-override + by-id registry, with the custom editor deferred. Two substantive refinements adopted: (1) **T1 and T7 are a single architectural decision** — the override-map registry IS the architecture, not an impl detail; (2) the accent-shifted 4th preset is the weak link — recognition comes from background/surface shifts, so the 4th preset must be a distinct-surface palette, not accent-only.

| # | Decision | Call | Why |
|---|----------|------|-----|
| D5-1 | T1 Ambition | **(a) Curated preset theme library, no color editing** — structured as a token-override map + by-id registry so constrained customization (b) is a clean fast-follow; full token editor + background images (c) deferred | Serves the #1 goal ("know which project you're in") with zero AI-slop; the architecture makes (b)/(c) non-painful later. The spec's literal "custom themes via editor v1" is INTENTIONALLY deferred (not dropped). |
| D5-2 | T7 Application (= D5-1, the linchpin) | **(a) JS `element.style.setProperty('--token', v)` override map over the existing `data-theme` base set; token names registry-whitelisted** | One path for built-ins, per-project, and future custom themes; CSP-safe (no injected `<style>`); no styles.css bloat. T1=a and T7=a stand or fall together. |
| D5-3 | T2 themeId model | **(a) Widen `ProjectBase.themeId` from the ThemeChoice enum to a registry theme-id (absent = use global); migrate old `dark\|light\|system` explicitly** | The registry is by-id anyway; do the migration while the field is new and `absent=global` already exists. `'system'` stops being a themeId value and becomes a property of the Default theme. Invasive into just-shipped Plan 3 code — isolate + re-run gates. |
| D5-4 | T3 Built-in presets | **Default (Cobalt dark+light, OS-following) + Sepia/warm + High-contrast + one DISTINCT-SURFACE palette (e.g. Graphite/Forest — NOT accent-only)**; all contrast-checked | Recognition comes from bg/surface shifts, not accent; an accent-only variant dilutes the single-accent discipline and reads as slop. |
| D5-5 | T4 Per-project scope | **(b) chrome + document both**, with calm `--transition` transitions; consider a complementary per-project marker (chip/rail) so full chrome repaint doesn't disorient | The persistently-visible chrome is what makes a project recognizable; doc-only is too weak. |
| D5-6 | T5 Persistence | **(a) renderer localStorage for built-in-only v1** (global selection in `curator.theme`; per-project theme-id via registry/updateProjectSettings); `userData/themes/*.json` + theme-CRUD IPC deferred with custom themes | Built-ins are static code; only the selection needs persisting, which already happens. No ADR-0003 conflict (that governs custom-theme assets, which arrive with (c)). |
| D5-7 | T6 Editor IA | **(b) a theme library (pick ONE theme carrying both regions + base/variant) replaces today's two segmented controls; Default ships as the current mixed dark-chrome/light-doc combo so nothing regresses**; per-region "advanced override" (c) parked as a named fast-follow | Collapses two mental models into one, matches the "Theme — not light/dark mode" vocabulary; the mixed default survives as the named Default. |
| D5-8 | T8 Customization (deferred) | **Out of scope for v1**; fast-follow = base mode + accent from a CURATED design-system swatch (never a freeform picker) + WCAG contrast validation before save | Curated swatch is the load-bearing anti-slop guardrail; full token editing + background images stay out until a real need + a security/storage model. |

**Sequencing:** Plan 5's `themeId` widening (D5-3) touches `src/shared/types.ts` / `src/renderer/src/App.tsx` / `ManageProjects.tsx` — files Plan 4 is concurrently modifying. Plan 5 builds **after Plan 4 merges**; its implementation plan reconciles against post-Plan-4 code.

### Theme-gallery design review (resolved via dual council, 2026-06-14)

Design review hardened the gallery spec (IA/2×2 grid, token-rendered swatches, states, motion, keyboard/a11y, verbatim copy) and surfaced four UX forks. **Both councils unanimously backed all four leads**, holding to one principle: *distinctiveness comes from surfaces, not from spending the single cobalt accent.*

| # | Decision | Call | Why |
|---|----------|------|-----|
| D5-9 | TF-1 Live-preview scope | **(b) Swatch-only preview + commit-to-apply** (token-faithful swatches keep an immersive option open later) | The Settings modal occludes most of the app, so whole-app hover recolor buys little visible payoff while flickering the grid; the real-token swatch is already a truthful preview. |
| D5-10 | TF-2 4th preset identity | **(a) Graphite** — neutral charcoal distinct-surface palette, cobalt accent retained | Recognition rides surface shifts; Forest smuggles in a second hue that competes with the single interactive accent and collides with status-green. |
| D5-11 | TF-3 Per-project control form | **(a) `<select>` (Use global + theme list) + a small swatch chip beside the selected option** | EditProjectModal is assignment altitude, not browse; a mini-gallery duplicates the global picker and dominates a dense form. The chip closes the recognition gap cheaply. |
| D5-12 | TF-4 Default card | **(a) One card, split swatch, labeled "Default — mixed" + tooltip** | The default is genuinely one pinned mixed dark-chrome/light-document theme; two cards would label one real theme as two non-independent choices and inflate the set. |

### Engineering deep-review (resolved via dual council, 2026-06-14)

Deep-review verdict: **READY-WITH-FIXES (7/10)** — 4 mechanical must-fix bugs + 2 decision points (both councils confirmed both leads, adding implementation guardrails).

| # | Decision | Call | Why |
|---|----------|------|-----|
| D5-13 | P5-DP1 — gallery keyboard nav | **(b) Roving-focus-only** — arrows move focus + a roving marker; commit only on click/Enter/Space. **`aria-checked` tracks the COMMITTED theme, focus roves independently** | Commit-on-arrow (standard ARIA selection-follows-focus) would recolor the whole app on every keypress — the exact flicker D5-9 rejected for hover; the spec keyboard table already says arrows=focus, Enter/Space=commit. Guardrail: don't let AT announce a roved-but-uncommitted card as selected. |
| D5-14 | P5-DP2 — legacy themeId cleanup | **(a) Write-time only** (drop the stale enum on the next `updateProjectSettings`); note a deferred one-shot versioned migration as the eventual closer | Stale `'dark'\|'light'\|'system'` is inert (resolves to Default); a read-path write-on-read violates "reads don't mutate" for cosmetic tidiness. Pre-commit to a versioned migration only if the legacy enum is later removed from the type. |

Adopted must-fix bugs (deep review — folded into the plan):
- **MF1** — T1 isn't typecheck-green: move the `editProjectModal.test.ts` `ThemeChoice→string` annotation changes from T4 into T1 (the widened `onSetTheme` param breaks the test's typed capture arrays otherwise).
- **MF2** — T4's "does not emit when nothing changed" test will FAIL (seed `themeId:'dark'` → `isKnown` false → seeds `''` → save fires `undefined`). Re-seed to a valid id / `undefined`, or assert the legacy-migration-on-save behavior + rename.
- **MF3** — T3 gallery tooltip test uses a descendant selector (`def.querySelector('[title]')`) for a self-attribute; assert `def.getAttribute('title')`.
- **MF4** — Launch-flash regression: the theme-apply effect must be `useLayoutEffect` (not `useEffect`) so `data-theme` + overrides are written before first paint (else the document pane flashes dark for one frame under Default).
- Nice-to-haves folded: comment pinning `BASE_SWATCH` to the styles.css source; `BUILTIN_THEME_IDS` cross-ref comment in ipc.ts.

**Build & verdict (Codex offload, architect-judged 2026-06-15):** implementation offloaded to a Codex builder, tasks T1-T5 (5 slice-pure commits, keep-green `Region*` strategy). Architect re-ran every frozen gate RAW: `bun test` 208 pass / 0 fail, `bun run typecheck` exit 0, `bunx electron-vite build` exit 0; spot-checked the council invariants in code: MF4 `useLayoutEffect` apply on `appShellRef`+`mainRef` with override clearing (`removeProperty` over the whitelist), D5-13 gallery roving-focus (arrows only `moveFocus`, Enter/Space commit, `aria-checked` on the selected theme), Graphite `GRAPHITE_DARK` has zero `--accent` overrides, and the `THEMEABLE_TOKENS` whitelist is enforced at module load. Disagreements D0-1 (T1/T2 freeze split) / D0-2 (sequential not concurrent lanes) / D0-3 (strengthened a variant-fallback test that wasn't exercising fallback) / D0-4 (followed the committed pinned-Default design over a loose "OS-following" handoff phrase) all ACCEPTED. **Verdict: ACCEPT.** Merged to `main` (42e91cb) and pushed.

---

## Roadmap complete

All three roadmap plans shipped to `main`, every decision resolved by dual council (Claude `/bork:council` + Codex) and documented above:
- **Plan 3** — Manage Projects view (115/0) · merged 4b5d7d5
- **Plan 4** — file-watch / session memory / command palette (166/0) · merged db8175f
- **Plan 5** — theming editor / preset theme library (208/0) · merged 42e91cb

Process: scope → dual-council decisions → (design-review where design-bearing, dual-council) → spec → implementation plan → deep-review (dual-council) → Codex build (architect/builder offload) → raw gate judging → merge. Deferred fast-follows are recorded in each plan's spec (custom theme editor + background images, palette tier-3, fuzzy highlight, per-region theme override, incremental reindex, Linux recursive watch, main-side settings store).
