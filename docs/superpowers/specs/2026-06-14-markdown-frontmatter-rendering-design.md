# Markdown Frontmatter Rendering — Design

**Date:** 2026-06-14
**Status:** Approved
**Branch:** `frontmatter-rendering` (off `main`)

## Problem

Markdown documents often begin with a YAML-style frontmatter block delimited by
`---` fences (`key: value` lines between them). Today this block falls through to
`marked`, which renders the opening `---` as a stray horizontal rule and the
`key: value` lines as loose paragraph text. The metadata should instead render as
a distinct, faded, monospaced section so it reads as document metadata rather than
body content.

## Goals

- Detect a frontmatter block at the top of a markdown document.
- Render it as a faded, monospaced two-column (key / value) section above the body.
- Leave the document body, TOC, diagrams, and code highlighting unchanged.
- Sanitize frontmatter values through the same path as all other rendered HTML.

## Non-goals

- Parsing YAML semantics (lists, nesting, types, quoting, anchors). Values are raw strings.
- TOML / `+++` frontmatter or any non-`---` delimiter.
- Frontmatter handling in non-markdown (e.g. HTML) documents.

## Architecture

All work is renderer-side in `src/renderer/src/lib/render.ts`. `DocView` is
unchanged: it already consumes the single sanitized HTML string from
`renderMarkdown()`, and a frontmatter section contains no headings or diagrams, so
`buildToc` / `highlightCode` / `enhanceDiagrams` are unaffected.

### Extraction

A pure helper:

```
extractFrontmatter(md: string): { pairs: Array<{ key: string; value: string }>, body: string }
```

Rules:

1. Skip any leading blank lines / whitespace-only lines.
2. The next line must be exactly `---` (after trim) to open a block. Otherwise no
   frontmatter: return `{ pairs: [], body: md }` (the original string, untouched).
3. Collect subsequent lines until a line that is exactly `---` (after trim) closes
   the block.
4. **No closer found → not frontmatter.** Return `{ pairs: [], body: md }` with the
   original string. (A document that merely opens with a `---` thematic break still
   renders normally.)
5. For each line inside the block:
   - Blank / whitespace-only lines are dropped.
   - Split on the **first** `:` only. Text before → `key` (trimmed); text after →
     `value` (trimmed). So `time: 12:30` yields key `time`, value `12:30`.
   - A line with no `:` becomes a value-only pair: `{ key: '', value: <trimmed line> }`.
     (Gracefully handles YAML list items like `- draft` without parsing them.)
6. `body` is everything after the closing `---` line (leading newline trimmed),
   handed to `marked` exactly as the whole string is today.

### Rendering

`renderMarkdown` calls `extractFrontmatter` first. When `pairs` is non-empty it
builds a frontmatter HTML fragment and prepends it to the `marked` output; the
**combined** string then goes through the existing `DOMPurify.sanitize(...)` call,
so values are sanitized identically to body content (the existing XSS tests guard
this path).

Markup (keys/values HTML-escaped before insertion):

```html
<dl class="frontmatter">
  <dt>title</dt><dd>My Document</dd>
  <dt>tags</dt><dd>spec, draft</dd>
  <dd class="frontmatter-loose">- draft</dd>   <!-- empty-key row -->
</dl>
```

`dl` / `dt` / `dd` survive DOMPurify's default HTML profile. Empty-key rows emit a
single `<dd class="frontmatter-loose">` that spans both columns.

### Styling (`src/renderer/src/styles.css`, Cobalt Reader tokens)

- `.frontmatter`: CSS grid, `grid-template-columns: max-content 1fr`, column/row
  gap from spacing tokens, `font-family: var(--font-mono)`, `color: var(--muted)`
  (the "faded" look), `font-size: var(--text-sm)`, a subtle bottom border
  (`border-bottom`) and bottom margin to separate it from the body.
- `dt`: slightly emphasized vs `dd` (e.g. `var(--fg)` or medium weight) while
  staying within the muted section.
- `.frontmatter-loose`: `grid-column: 1 / -1` so colon-less rows span full width.

### Word count

`computeDocStats` clones the container and strips `.code-toolbar` / `.code-gutter`
before counting words. Add `.frontmatter` to that strip list so metadata is not
counted as document words.

## Testing (`tests/render.test.ts`, jsdom)

- Valid block → a `.frontmatter` `<dl>` with the expected `<dt>` / `<dd>` text.
- Leading blank lines before the opening `---` are tolerated.
- Missing closing `---` → no `.frontmatter`; content renders as markdown.
- A `---` appearing mid-document (not at top) is not treated as frontmatter.
- A value containing `:` splits on the first colon only (`time: 12:30` → `12:30`).
- A colon-less line yields a `.frontmatter-loose` empty-key row.
- HTML in a value is sanitized (no `<script>` / `onerror` survives).
- `computeDocStats` does not count frontmatter text as words.

## Out-of-scope / future

- YAML semantics, TOML frontmatter, non-markdown frontmatter (see Non-goals).
