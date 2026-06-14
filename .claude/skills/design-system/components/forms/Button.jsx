import React from 'react'

const STYLE_ID = 'cr-button-styles'
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
  .cr-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
    font-family: var(--font-ui); font-weight: var(--weight-medium); line-height: 1;
    border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer;
    white-space: nowrap; text-decoration: none; user-select: none;
    transition: background var(--transition), color var(--transition),
      border-color var(--transition), box-shadow var(--transition), transform var(--transition);
  }
  .cr-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-ring); }
  .cr-btn:active { transform: translateY(0.5px); }
  .cr-btn[disabled] { opacity: 0.45; cursor: not-allowed; pointer-events: none; }

  .cr-btn--sm { height: 28px; padding: 0 var(--space-3); font-size: var(--text-sm); }
  .cr-btn--md { height: 34px; padding: 0 var(--space-4); font-size: var(--text-base); }
  .cr-btn--lg { height: 42px; padding: 0 var(--space-5); font-size: var(--text-md); }
  .cr-btn--full { width: 100%; }

  .cr-btn--primary { background: var(--accent); color: #fff; }
  .cr-btn--primary:hover { background: var(--accent-hover); box-shadow: var(--glow-accent); }
  .cr-btn--primary:active { background: var(--accent-active); }

  .cr-btn--secondary { background: var(--surface-alt); color: var(--fg); border-color: var(--border-strong); }
  .cr-btn--secondary:hover { background: var(--surface-raised); border-color: var(--accent); }

  .cr-btn--ghost { background: transparent; color: var(--muted); }
  .cr-btn--ghost:hover { background: var(--surface-alt); color: var(--fg); }

  .cr-btn--danger { background: transparent; color: var(--error); border-color: color-mix(in srgb, var(--error) 45%, transparent); }
  .cr-btn--danger:hover { background: var(--error-soft); border-color: var(--error); }

  .cr-btn__icon { font-size: 0.95em; line-height: 1; }
  `
  document.head.appendChild(el)
}

export function Button(props) {
  const {
    variant = 'primary', size = 'md', icon, iconRight,
    fullWidth = false, disabled = false, type = 'button',
    className = '', children, ...rest
  } = props
  const cls = [
    'cr-btn', `cr-btn--${variant}`, `cr-btn--${size}`,
    fullWidth ? 'cr-btn--full' : '', className
  ].filter(Boolean).join(' ')
  return (
    <button type={type} className={cls} disabled={disabled} {...rest}>
      {icon && <i className={`cr-btn__icon ${icon}`} aria-hidden="true"></i>}
      {children && <span>{children}</span>}
      {iconRight && <i className={`cr-btn__icon ${iconRight}`} aria-hidden="true"></i>}
    </button>
  )
}
