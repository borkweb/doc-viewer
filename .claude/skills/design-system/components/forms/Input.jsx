import React from 'react'

const STYLE_ID = 'cr-input-styles'
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
  .cr-input { display: inline-flex; align-items: center; gap: var(--space-2);
    width: 100%; height: 34px; padding: 0 var(--space-3);
    background: var(--surface-alt); border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); color: var(--fg);
    transition: border-color var(--transition), box-shadow var(--transition), background var(--transition); }
  .cr-input:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
  .cr-input__icon { color: var(--muted); font-size: 13px; flex: none; }
  .cr-input__field { flex: 1; min-width: 0; background: none; border: 0; outline: none;
    color: var(--fg); font: var(--text-ui)/1 var(--font-ui); }
  .cr-input__field::placeholder { color: var(--muted); }
  .cr-input__field[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; }
  /* Flush chrome variant — no box, fills like a sidebar control */
  .cr-input--flush { background: transparent; border-color: transparent; }
  .cr-input--flush:hover { background: var(--surface-alt); }
  .cr-input--flush:focus-within { background: var(--accent-soft); border-color: transparent; box-shadow: none; }
  `
  document.head.appendChild(el)
}

export function Input(props) {
  const { icon, flush = false, className = '', type = 'text', ...rest } = props
  const cls = ['cr-input', flush ? 'cr-input--flush' : '', className].filter(Boolean).join(' ')
  return (
    <label className={cls}>
      {icon && <i className={`cr-input__icon ${icon}`} aria-hidden="true"></i>}
      <input className="cr-input__field" type={type} {...rest} />
    </label>
  )
}
