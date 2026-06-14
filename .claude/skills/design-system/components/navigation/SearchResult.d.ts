import React from 'react'

export interface SearchResultProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** The matched Section heading (falls back to docTitle for intro sections). */
  heading?: string
  /** Parent Document title. */
  docTitle: string
  /** Relative path of the Document, shown in the meta line. */
  docPath?: string
  /** Snippet HTML — may contain <mark> tags around matched terms. */
  snippet?: string
}

/**
 * A search hit row in the sidebar — points at one Section. Shows the heading,
 * the Document it belongs to, and a 2-line snippet with <mark> highlights.
 */
export function SearchResult(props: SearchResultProps): JSX.Element
