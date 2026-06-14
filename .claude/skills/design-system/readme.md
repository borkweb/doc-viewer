# Cobalt Reader — Curator Design System

**Cobalt Reader** is the design system for **Curator**, a desktop (Electron) app
for browsing, navigating, and searching documentation drawn from local directories
or GitHub repositories — one selectable **Project** at a time. It is a rich cobalt +
slate theme that ships in **two modes — a signature dark mode (the default) and an
opt-in light mode** — with electric blue and cyan highlights and a modern, IDE-like
feel suited to technical documentation.

In Curator's own vocabulary, a *Theme* is "a reusable, named, app-side look — a
palette of CSS custom-property overrides." Cobalt Reader is exactly that: a fully
realized Theme with light + dark palettes, plus the reusable components and screens
that compose it.

## Sources

- **Codebase:** `curator/` (Electron + Vite + React renderer). Author: Matthew
  Batchelder. Key files studied:
  - `src/renderer/src/styles.css` — the stock token system (light/dark via
    `prefers-color-scheme`) this Theme re-skins.
  - `src/renderer/src/components/{Sidebar,DocTree,SearchBox,DocView}.tsx` — the real
    sidebar, tree, search, and reading-pane structure the UI kit recreates.
  - `src/shared/types.ts` — the domain types (`Project`, `NavNode`, `Section`,
    `SearchResult`) the UI kit's fake data mirrors.
  - `CONTEXT.md` — the domain glossary (Project / Document / Section / Ref / Theme /
    Rebuild) that drives all product copy.
  - `.claude/skills/doc-viewer-ui-design/` — the existing in-repo UI design skill
    (modeled on Automattic's Studio): one accent, dense chrome + readable docs,
    4px rhythm, compose-tokens-don't-hardcode. Cobalt Reader keeps these principles
    and swaps the palette to dark cobalt.
- **Palette brief:** "Cobalt Reader" cobalt/slate dark theme supplied by the user
  (primary `#4A9EFF`, slate `#1C2B3A`, cyan accent `#56CCF2`, bg `#0A0F1E`).

## What's in here

This is a compiled design system. `styles.css` (root) is the single entry point a
consumer links; it `@import`s every token and font file.

| Path | What |
|---|---|
| `styles.css` | Entry point — `@import` manifest only |
| `tokens/colors.css` | Base palette + semantic color aliases |
| `tokens/typography.css` | Font families, type scale, weights |
| `tokens/spacing.css` | 4px spacing scale, radii, elevation/glow, motion |
| `tokens/fonts.css` | JetBrains Mono webfont (`@import` from Google Fonts) |
| `tokens/base.css` | Applied element styles + `.cobalt-doc` reading typography |
| `components/forms/` | `Button`, `IconButton`, `Input`, `Select` |
| `components/display/` | `Badge`, `Card` |
| `components/navigation/` | `TreeItem`, `SearchResult` |
| `ui_kits/curator/` | Full interactive recreation of the Curator app |
| `guidelines/*.card.html` | Foundation specimen cards (Design System tab) |
| `SKILL.md` | Agent Skill manifest for downloaded use |

---

## CONTENT FUNDAMENTALS

Curator's copy is **precise, quiet, and domain-disciplined** — it reads like a
well-kept engineering glossary, because it is one.

- **Voice:** Neutral and declarative. State what a thing *is* or *does*; don't sell
  it. "A desktop app for browsing, navigating, and searching documentation." No
  adjectives doing emotional work, no exclamation.
- **Person:** Mostly impersonal/third-person about the product's nouns ("A Project
  has one source"). Imperative for user actions ("Add a local directory", "Pull
  latest", "Select a document"). Rarely "you"; never "we" in UI surfaces.
- **Vocabulary is canonical and enforced.** The product has a controlled vocabulary
  with explicit *avoid* lists. Use the exact terms:
  - **Project** (not repo / docset / library / source)
  - **Document** (short form `doc` in code only; never "page" or "file")
  - **Source file** (any on-disk file; only the discovered subset are Documents)
  - **Section** (not chunk / passage / fragment) — the unit of search
  - **Ref** (not branch — covers tags/commits too)
  - **Rebuild** is the internal op; the **user-facing labels are "Pull latest"**
    (GitHub) and **"Reindex"** (local). Never "Refresh" in the UI.
  - **Theme** (not skin / style; not light-vs-dark mode)
- **Casing:** Sentence case everywhere — headings, buttons, menu items
  ("Pull latest", not "Pull Latest"). Domain nouns are Capitalized when used as
  defined terms (Project, Document, Section, Ref). UPPERCASE is reserved for small
  section eyebrows/labels (the folder header in the tree).
- **Microcopy is terse.** Placeholders: "Search docs…", "Select a project…".
  Empty states: "Add or select a project to begin.", "Select a document.", "No
  matches." Status is a single word: Ready / Building / Unavailable / Error.
- **Numbers are factual, never decorative.** "Indexed 18 documents · 142 sections."
  Counts and paths, not marketing metrics.
- **Emoji:** none. **Unicode glyphs as icons:** the stock app used a bare "＋"; this
  system replaces ad-hoc glyphs with Font Awesome (see ICONOGRAPHY).
- **Vibe:** a calm, focused developer tool. Information-dense where it's chrome,
  comfortable where it's prose. Restraint over flourish.

---

## VISUAL FOUNDATIONS

The whole look hinges on **restraint plus depth**: a tightly constrained cobalt
palette, one interactive accent, and just enough glow/shadow to make a dark surface
feel dimensional and IDE-like.

### Color
- **Two modes, dark by default.** Dark is the brand's hero look and the default
  (`:root`); light is an opt-in cobalt-tinted day mode. Toggle by setting a
  `data-theme` attribute on `<html>` — `document.documentElement.dataset.theme =
  'light'` (or `'dark'`); unset means dark. Every component composes the same
  semantic tokens, so both modes come for free. Consumers who want OS-driven
  switching can add `@media (prefers-color-scheme: light){ :root:not([data-theme]){…} }`.
- **Dark:** deep cobalt-black reading background (`--bg #0A0F1E`); slate chrome
  steps up through `--surface #111D28` → `--surface-alt #1C2B3A` →
  `--surface-raised #2A3F54`. Surfaces get *lighter* as they come forward.
- **Light:** white reading background (`--bg #FFFFFF`) with faint cobalt-gray chrome
  (`--surface #EFF3FB` → `--surface-alt #E4EBF6`), deep-slate ink (`--fg #14233A`),
  and the deeper cobalt (`--primary-dark #1A7FE8`) as accent for contrast on white.
- **One interactive accent:** electric cobalt blue. Dark uses `--accent #4A9EFF`
  (hover brightens to `#7BBDFF`); light uses `#1A7FE8` (hover darkens to `#1565C8`).
  Links, active rows, focus rings, and the single filled CTA all use it — a
  single-accent discipline inherited from the app's Studio-derived language.
- **Electric cyan (`--highlight`) is the second voice, used sparingly:** search-term
  `<mark>` highlights, accent badges, and text selection. Never a general-purpose UI
  color. (Light mode deepens it to `--cyan-dark #2BB5E0` for legibility.)
- **Semantic status only** — green/amber/red appear for Project status
  (Ready/Building/Error) and inline errors, never for ordinary UI; each is darkened
  in light mode so it reads on white.
- **Text:** `--fg` primary, `--muted` for metadata, labels, and secondary text.
  Borders are a low-contrast hairline (`--border`).

### Type
- **UI: native system stack** (`-apple-system, …`) — faithful to the app, fast,
  unobtrusive. **Code: JetBrains Mono** (webfont) for the documented IDE feel; falls
  back to `ui-monospace`/SF Mono.
- **Two density registers, deliberately split:** chrome is dense
  (`--text-ui 13px / 1.54`) to pack the sidebar and tree; document body is
  comfortable (`--text-doc 15px / 1.65`) for sustained reading. Don't shrink body to
  chrome density or inflate chrome to body size.
- Section eyebrows: `--text-label 11px`, weight 500, UPPERCASE, letter-spaced.

### Spacing, geometry, radius
- **4px rhythm** — all padding/gap in multiples of 4.
- **Radii climb with surface size:** `--radius-sm 3px` (inputs, buttons, chips),
  `--radius 6px` (chrome panels, rows), `--radius-lg 10px` (code blocks, cards,
  diagrams), `--radius-xl 16px` (modals), `--radius-full` (pills/badges).
- Sidebar is a fixed `--sidebar-w 264px`; reading column caps at `--content-w 860px`.

### Backgrounds, elevation, glow
- **No images, gradients, patterns, or textures as backgrounds** — surfaces are flat
  solid slate fills separated by hairline borders. Depth comes from the
  surface-step palette, not decoration.
- **Flatness is the default.** Shadows are reserved for things that genuinely float
  (cards, popovers, modals) and are mode-aware: deep near-black in dark mode
  (`--shadow`, `--shadow-lg`), soft cool-gray in light mode. They're defined per
  theme in `tokens/colors.css`, not in the spacing layer.
- **The cobalt glow is the signature.** `--glow-accent` (a soft blue halo + ring)
  appears on primary-button hover and interactive-card hover; `--glow-cyan` for rare
  cyan emphasis. This is what gives the system its "electric / IDE" character — use
  it only on the primary accent, never broadly.

### Borders, cards, surfaces
- **Hairline `1px solid var(--border)`** separates every region (titlebar, sidebar,
  toolbar, table cells, code blocks). Regions are tinted with a surface step rather
  than boxed in heavy outlines.
- **Cards:** `--surface` fill, hairline border, `--radius-lg`. Flat by default;
  `raised` adds `--shadow`; `interactive` makes the whole card a button that gains an
  accent border + glow on hover.

### Chrome controls vs. content buttons
- **Chrome controls** (sidebar select, search input, icon buttons, tree/result rows)
  are **flush and borderless** — transparent at rest, `--surface-alt` tint on hover,
  `--accent-soft` on focus, `--radius` corners. The sidebar reads as one calm
  surface; the accent is reserved for selection and links.
- **Content buttons** (a toolbar's "Pull latest", a modal's primary action) may be
  filled `--accent` (primary) or bordered secondary — a different context from
  sidebar chrome.

### Interaction states
- **Hover:** chrome → background tint shift (transparent → `--surface-alt`); rows →
  `--accent-soft`; primary button → brightens + `--glow-accent`.
- **Active/selected:** `--accent-soft` background + `--accent` text + 600 weight
  (tree rows), or accent-tinted icon button.
- **Press:** a 0.5–1px downward `translateY` nudge; primary buttons also darken to
  `--accent-active`. No scale-bounce.
- **Focus-visible:** a 3px `--accent-ring` halo. Never remove focus outlines.

### Motion
- **Quick and subtle, never bouncy.** `--transition 120ms ease` for hover/focus
  color and background shifts; `--transition-slow 220ms` for larger affordances;
  `--ease-out` for the rare entrance. No infinite/decorative animation.

### Transparency & blur
- Used **once, purposefully:** the sticky reading-pane toolbar uses
  `backdrop-filter: blur(8px)` over a translucent `--bg` so content scrolls under it.
  Otherwise surfaces are opaque.

---

## ICONOGRAPHY

- **Icon system: Font Awesome 6 (Free)**, loaded from CDN
  (`cdnjs … font-awesome/6.5.2/css/all.min.css`). This is a deliberate choice for
  this design system — the stock Curator code used bare Unicode glyphs (e.g. a
  "＋" for the add-project button); Cobalt Reader standardizes on Font Awesome so
  icons are consistent in weight and metrics.
- **Style:** **Solid** (`fa-solid`) as the default single weight; **Brands**
  (`fa-brands`) only for real logos (`fa-github`, `fa-html5`). Don't mix in regular
  or light weights — one weight keeps the chrome calm.
- **Color & size:** icons are `--muted` at rest and `--accent` when active/selected,
  matching their row. Chrome icons render ~12–15px; empty-state icons ~40px in
  `--slate-light`. Icons inherit `currentColor`.
- **Common glyphs:** `fa-file-lines` (Document), `fa-folder` / `fa-folder-open`
  (folder / local source), `fa-magnifying-glass` (search), `fa-plus` (add project),
  `fa-rotate` (Pull latest / Reindex), `fa-code-branch` (Ref), `fa-github` (GitHub
  Project), `fa-hashtag` (Section anchor in search results), `fa-chevron-right`
  (tree disclosure / breadcrumb), `fa-diagram-project` (mermaid diagram),
  `fa-gear` (settings), `fa-trash` (remove). See the "Iconography" card.
- **No emoji.** No hand-drawn or bespoke SVG icons — use Font Awesome glyphs so the
  set stays coherent.
- Components take Font Awesome class strings via an `icon` prop (e.g.
  `<Button icon="fa-solid fa-rotate">`), so any glyph in the library is available.

> **Substitution flag:** JetBrains Mono (code font) is a webfont enhancement over the
> app's stock system-mono stack, chosen for the "IDE-like feel." If you'd prefer the
> native mono stack or a different mono, let me know and I'll swap it.
