import React from 'react'

export interface SelectOption { value: string; label: string }

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Options as strings or {value,label} objects. Or pass <option> children. */
  options?: Array<string | SelectOption>
  /** Disabled placeholder shown first. */
  placeholder?: string
  /** Flush, borderless chrome style (sidebar project switcher). */
  flush?: boolean
}

/**
 * A native select with a Font Awesome chevron. `flush` matches the borderless
 * sidebar project switcher; boxed otherwise.
 */
export function Select(props: SelectProps): JSX.Element
