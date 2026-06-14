import React from 'react'

const STYLE_ID = 'cr-select-styles'
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
  .cr-select { position: relative; display: inline-flex; align-items: center; width: 100%; }
  .cr-select__field { appearance: none; -webkit-appearance: none;
    width: 100%; height: 34px; padding: 0 var(--space-8) 0 var(--space-3);
    background: var(--surface-alt); color: var(--fg);
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    font: var(--text-ui)/1 var(--font-ui); cursor: pointer;
    transition: border-color var(--transition), box-shadow var(--transition), background var(--transition); }
  .cr-select__field:hover { border-color: var(--accent); }
  .cr-select__field:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
  .cr-select__chevron { position: absolute; right: var(--space-3); color: var(--muted); pointer-events: none; font-size: 12px; }
  /* Flush chrome variant — the sidebar project switcher */
  .cr-select--flush .cr-select__field { background: transparent; border-color: transparent; font-weight: var(--weight-medium); }
  .cr-select--flush .cr-select__field:hover { background: var(--surface-alt); }
  .cr-select--flush .cr-select__field:focus-visible { background: var(--accent-soft); box-shadow: none; }
  `
  document.head.appendChild(el)
}

export function Select(props) {
  const { options = [], flush = false, placeholder, className = '', children, ...rest } = props
  const cls = ['cr-select', flush ? 'cr-select--flush' : '', className].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <select className="cr-select__field" {...rest}>
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((o) => {
          const value = typeof o === 'string' ? o : o.value
          const label = typeof o === 'string' ? o : o.label
          return <option key={value} value={value}>{label}</option>
        })}
        {children}
      </select>
      <i className="cr-select__chevron fa-solid fa-chevron-down" aria-hidden="true"></i>
    </div>
  )
}
