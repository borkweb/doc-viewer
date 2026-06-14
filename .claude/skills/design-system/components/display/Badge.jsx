import React from 'react'

const STYLE_ID = 'cr-badge-styles'
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
  .cr-badge { display: inline-flex; align-items: center; gap: 5px;
    font-family: var(--font-ui); font-size: var(--text-xs); font-weight: var(--weight-medium);
    line-height: 1; padding: 4px 8px; border-radius: var(--radius-full);
    border: 1px solid transparent; white-space: nowrap; }
  .cr-badge--pill { border-radius: var(--radius-full); }
  .cr-badge--square { border-radius: var(--radius-sm); }
  .cr-badge__dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  .cr-badge--neutral { background: var(--surface-alt); color: var(--muted); border-color: var(--border); }
  .cr-badge--accent  { background: var(--accent-soft); color: var(--accent-hover); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
  .cr-badge--cyan    { background: var(--highlight-soft); color: var(--cyan-light); border-color: color-mix(in srgb, var(--cyan) 30%, transparent); }
  .cr-badge--success { background: var(--success-soft); color: var(--success); border-color: color-mix(in srgb, var(--success) 30%, transparent); }
  .cr-badge--warning { background: var(--warning-soft); color: var(--warning); border-color: color-mix(in srgb, var(--warning) 30%, transparent); }
  .cr-badge--error   { background: var(--error-soft); color: var(--error); border-color: color-mix(in srgb, var(--error) 35%, transparent); }
  `
  document.head.appendChild(el)
}

export function Badge(props) {
  const { tone = 'neutral', shape = 'pill', dot = false, icon, className = '', children, ...rest } = props
  const cls = ['cr-badge', `cr-badge--${tone}`, `cr-badge--${shape}`, className].filter(Boolean).join(' ')
  return (
    <span className={cls} {...rest}>
      {dot && <span className="cr-badge__dot"></span>}
      {icon && <i className={icon} aria-hidden="true"></i>}
      {children}
    </span>
  )
}
