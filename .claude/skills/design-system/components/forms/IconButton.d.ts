import React from 'react'

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Font Awesome class string, e.g. "fa-solid fa-magnifying-glass". */
  icon: string
  size?: 'sm' | 'md' | 'lg'
  /** Toggled/selected state — accent tint. */
  active?: boolean
  /** Accessible label + tooltip (icon-only control). */
  label?: string
}

/**
 * A borderless, flush icon-only control for chrome (toolbars, sidebar header).
 * Transparent at rest, slate tint on hover, accent tint when `active`.
 */
export function IconButton(props: IconButtonProps): JSX.Element
