import React from 'react'

const STYLE_ID = 'cr-iconbutton-styles'
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
  .cr-iconbtn {
    display: inline-flex; align-items: center; justify-content: center;
    background: transparent; border: 0; color: var(--muted); cursor: pointer;
    border-radius: var(--radius); transition: background var(--transition), color var(--transition), box-shadow var(--transition);
  }
  .cr-iconbtn:hover { background: var(--surface-alt); color: var(--fg); }
  .cr-iconbtn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-ring); }
  .cr-iconbtn[disabled] { opacity: 0.4; cursor: not-allowed; pointer-events: none; }
  .cr-iconbtn.is-active { background: var(--accent-soft); color: var(--accent); }
  .cr-iconbtn--sm { width: 28px; height: 28px; font-size: 13px; }
  .cr-iconbtn--md { width: 34px; height: 34px; font-size: 15px; }
  .cr-iconbtn--lg { width: 42px; height: 42px; font-size: 18px; }
  `
  document.head.appendChild(el)
}

export function IconButton(props) {
  const { icon, size = 'md', active = false, label, className = '', ...rest } = props
  const cls = ['cr-iconbtn', `cr-iconbtn--${size}`, active ? 'is-active' : '', className]
    .filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} aria-label={label} title={label} {...rest}>
      <i className={icon} aria-hidden="true"></i>
    </button>
  )
}
