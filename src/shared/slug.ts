// Canonical heading slugification, shared between the parse pipeline (main) and
// the renderer's buildToc. Both must agree so search → scroll lands on the right
// anchor. parse operates on raw heading text reduced via stripInlineMarkdown;
// the renderer operates on the rendered heading's textContent (already visible).

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Reduce the inline markdown of a single heading line to its visible text so it
// matches what the DOM renders. Handles images, links, inline code, and emphasis.
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images → alt text (may be empty)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → link text
    .replace(/`([^`]*)`/g, '$1') // inline code → contents
    .replace(/[*_~]+/g, '') // emphasis markers
    .replace(/\s+/g, ' ')
    .trim()
}
