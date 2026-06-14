---
name: cobalt-reader-design
description: Use this skill to generate well-branded interfaces and assets for Curator's Cobalt Reader theme — a rich cobalt + slate dark theme with electric blue/cyan highlights and an IDE-like feel for technical documentation. Use for production renderer UI or throwaway prototypes/mocks/slides. Contains design guidelines, color/type/spacing tokens, fonts, Font Awesome iconography, and reusable React UI kit components.
user-invocable: true
---

# Cobalt Reader design skill

Read the `readme.md` file in this skill first — it is the full design guide
(CONTENT FUNDAMENTALS, VISUAL FOUNDATIONS, ICONOGRAPHY) and a manifest of every
file. Then explore the other files as needed.

## What's here

- `styles.css` — the single entry point. Link this one file and you get every token,
  the JetBrains Mono webfont, and the `.cobalt-doc` reading typography. It is an
  `@import` manifest only; real declarations live in `tokens/*.css`.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `fonts.css`, `base.css`.
- `components/` — reusable React primitives (`Button`, `IconButton`, `Input`,
  `Select`, `Badge`, `Card`, `TreeItem`, `SearchResult`). Each has a `.d.ts` props
  contract and a `.prompt.md` usage note.
- `ui_kits/curator/` — a full interactive recreation of the Curator app.
- `guidelines/*.card.html` — foundation specimen cards (colors, type, spacing, icons).

## How to use it

- **Compose tokens; never hardcode** colors, fonts, radii, or spacing. Reach for
  `var(--accent)`, `var(--surface)`, `var(--radius)`, `var(--space-4)`, etc. If you
  need a value no token covers, add a token — don't inline a one-off.
- **One interactive accent** (`--accent` cobalt blue). Cyan (`--highlight`) is a
  sparing highlight (search marks, accent badges). Green/amber/red are status only.
- **Two type registers:** dense chrome (`--text-ui`) vs. comfortable body
  (`--text-doc` / `.cobalt-doc`).
- **Icons: Font Awesome 6** (solid by default, brands for logos). Pass class strings
  to component `icon` props, e.g. `<Button icon="fa-solid fa-rotate">Pull latest</Button>`.
- **Copy:** sentence case, terse, domain-disciplined. Use the canonical vocabulary
  (Project, Document, Section, Ref; "Pull latest" / "Reindex", never "Refresh").
  No emoji.

## Output

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out
and produce static HTML files for the user to view, linking `styles.css` and the
Font Awesome CDN. If working in the real Curator codebase, read the rules here and
keep styling in the renderer's token system.

If invoked with no other guidance, ask the user what they want to build, ask a few
focused questions, then act as an expert Cobalt Reader designer who outputs HTML
artifacts or production code as the need dictates.
