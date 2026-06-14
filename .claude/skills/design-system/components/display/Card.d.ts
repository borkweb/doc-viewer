import React from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Add soft elevation shadow. */
  raised?: boolean
  /** Render as a clickable button with accent-glow hover. */
  interactive?: boolean
  /** Optional Font Awesome icon shown in a tinted media chip. */
  icon?: string
  /** Optional title line. */
  title?: string
  children?: React.ReactNode
}

/**
 * A surface container — project cards, empty-state panels, settings groups.
 * Flat by default; `raised` floats it, `interactive` makes the whole card a
 * button that glows on hover.
 */
export function Card(props: CardProps): JSX.Element
