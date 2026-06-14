# Curator — UI kit

An interactive, high-fidelity recreation of the **Curator** desktop app in the
Cobalt Reader theme. It composes the design-system primitives — it does not
re-implement them.

## Run it

Open `index.html`. It mounts a single-window app with working state:

- **Project switcher** (top of sidebar) — switch between a local Project ("Doc
  Viewer"), a GitHub Project ("React", with a `main` Ref badge + Pull latest), and a
  Building Project ("Tailwind CSS").
- **Search** — type in the sidebar search box (try "section", "ref", "rebuild");
  results replace the tree. Clicking a result opens the Document and scrolls to the
  matched Section anchor.
- **Document tree** — folders expand/collapse; clicking a Document opens it in the
  reading pane. The active Document is accent-tinted.
- **Reading pane** — rendered markdown via the `.cobalt-doc` typography, a sticky
  blurred toolbar with breadcrumb + Ref badge + Pull latest/Reindex, tables, code
  blocks, blockquotes, `<mark>` highlights, and a mermaid-diagram placeholder.

## Files

| File | Role |
|---|---|
| `index.html` | Window chrome + layout CSS, script loading, mount point |
| `data.js` | Fake Projects / tree / Documents / search sections (mirrors `src/shared/types.ts`) |
| `Sidebar.jsx` | Project switcher, status, search, recursive doc tree |
| `Reader.jsx` | Reading pane, toolbar, empty states, diagram placeholder |
| `App.jsx` | Window frame + selection/search state orchestration |

## Fidelity notes

- Structure follows the real renderer (`App.tsx`, `Sidebar.tsx`, `DocTree.tsx`,
  `SearchBox.tsx`, `DocView.tsx`): a `var(--sidebar-w)` sidebar + flexible content
  grid, debounced-style search swapping the tree for results, and scroll-to-anchor on
  result open.
- Mermaid diagrams are shown as a styled placeholder canvas — the real app renders
  them with `mermaid` + `svg-pan-zoom` (click-to-expand). Faithful chrome, simplified
  internals, as intended for a UI kit.
- Content is drawn from the app's own `CONTEXT.md` domain glossary so the copy uses
  the canonical vocabulary (Project / Document / Section / Ref / Rebuild).
