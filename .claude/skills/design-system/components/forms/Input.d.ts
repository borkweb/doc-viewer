import React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Optional Font Awesome leading icon, e.g. "fa-solid fa-magnifying-glass". */
  icon?: string
  /** Flush, borderless chrome style (sidebar search). Default is a boxed field. */
  flush?: boolean
  type?: string
}

/**
 * Text / search field. Boxed by default for content forms; `flush` for
 * borderless sidebar chrome that tints on hover and focus.
 */
export function Input(props: InputProps): JSX.Element
