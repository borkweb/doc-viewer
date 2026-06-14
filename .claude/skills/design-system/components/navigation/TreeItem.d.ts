import React from 'react'

export interface TreeItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Display label — a Document title or folder name. */
  label: string
  /** Drives the leading icon. `folder` also shows a rotating chevron. */
  kind?: 'md' | 'html' | 'folder'
  /** Selected document (accent tint + bold). */
  active?: boolean
  /** Indentation level in the nav tree. */
  depth?: number
  /** Folder expanded state (rotates the chevron). */
  open?: boolean
  /** Override the Font Awesome icon. */
  icon?: string
}

/**
 * A row in Curator's navigation tree — a Document or a folder. Borderless,
 * full-width, accent-tinted on hover/active. Indent with `depth`.
 * @startingPoint section="Navigation" subtitle="Doc tree rows & folder labels" viewport="380x260"
 */
export function TreeItem(props: TreeItemProps): JSX.Element
