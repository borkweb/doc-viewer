import React from 'react'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Color tone. `accent`/`cyan` for emphasis; semantic tones for status. */
  tone?: 'neutral' | 'accent' | 'cyan' | 'success' | 'warning' | 'error'
  shape?: 'pill' | 'square'
  /** Show a leading status dot in the current color. */
  dot?: boolean
  /** Optional Font Awesome leading icon. */
  icon?: string
  children?: React.ReactNode
}

/**
 * A small status / metadata label. Used for project status (ok / building /
 * error), ref tags, doc kinds, and counts.
 * @startingPoint section="Display" subtitle="Status & metadata badges" viewport="700x150"
 */
export function Badge(props: BadgeProps): JSX.Element
