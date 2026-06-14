import React from 'react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. `primary` is the single filled accent action; use sparingly. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  /** Control height / padding / font size. */
  size?: 'sm' | 'md' | 'lg'
  /** Font Awesome class string rendered before the label, e.g. "fa-solid fa-plus". */
  icon?: string
  /** Font Awesome class string rendered after the label. */
  iconRight?: string
  /** Stretch to fill the container width. */
  fullWidth?: boolean
  disabled?: boolean
  children?: React.ReactNode
}

/**
 * The Cobalt Reader button. One filled `primary` accent per view; everything
 * else is `secondary`, `ghost`, or `danger`.
 * @startingPoint section="Forms" subtitle="Primary, secondary, ghost & danger buttons" viewport="700x180"
 */
export function Button(props: ButtonProps): JSX.Element
