import React from 'react'

const STYLE_ID = 'cr-treeitem-styles'
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
  .cr-tree-item { display: flex; align-items: center; gap: var(--space-2);
    width: 100%; text-align: left; background: none; border: 0; cursor: pointer;
    color: var(--fg); border-radius: var(--radius); padding: 5px var(--space-2);
    font: var(--text-ui)/var(--leading-ui) var(--font-ui);
    transition: background var(--transition), color var(--transition); }
  .cr-tree-item:hover { background: var(--accent-soft); }
  .cr-tree-item.is-active { background: var(--accent-soft); color: var(--accent); font-weight: var(--weight-semibold); }
  .cr-tree-item__icon { flex: none; width: 16px; text-align: center; color: var(--muted); font-size: 12px; }
  .cr-tree-item.is-active .cr-tree-item__icon { color: var(--accent); }
  .cr-tree-item__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cr-tree-item__chevron { flex: none; color: var(--muted); font-size: 10px;
    transition: transform var(--transition); }
  .cr-tree-item__chevron.is-open { transform: rotate(90deg); }
  /* Folder section label variant */
  .cr-tree-folder { color: var(--muted); font-size: var(--text-label); font-weight: var(--weight-medium);
    text-transform: uppercase; letter-spacing: var(--tracking-label);
    padding: var(--space-2) var(--space-2) var(--space-1); }
  `
  document.head.appendChild(el)
}

const KIND_ICON = { md: 'fa-solid fa-file-lines', html: 'fa-brands fa-html5', folder: 'fa-solid fa-folder' }

export function TreeItem(props) {
  const {
    label, kind = 'md', active = false, depth = 0, open,
    icon, className = '', ...rest
  } = props
  const isFolder = kind === 'folder'
  const glyph = icon || KIND_ICON[kind] || KIND_ICON.md
  const cls = ['cr-tree-item', active ? 'is-active' : '', className].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} style={{ paddingLeft: 8 + depth * 12 }} title={label} {...rest}>
      {isFolder && (
        <i className={`cr-tree-item__chevron fa-solid fa-chevron-right ${open ? 'is-open' : ''}`} aria-hidden="true"></i>
      )}
      <i className={`cr-tree-item__icon ${glyph}`} aria-hidden="true"></i>
      <span className="cr-tree-item__label">{label}</span>
    </button>
  )
}
