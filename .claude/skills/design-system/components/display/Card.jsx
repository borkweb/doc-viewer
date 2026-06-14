import React from 'react'

const STYLE_ID = 'cr-card-styles'
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
  .cr-card { display: block; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: var(--space-5); color: var(--fg); }
  .cr-card--raised { box-shadow: var(--shadow); }
  .cr-card--interactive { cursor: pointer; text-align: left; width: 100%;
    transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition), background var(--transition); }
  .cr-card--interactive:hover { border-color: var(--accent); box-shadow: var(--glow-accent); }
  .cr-card--interactive:active { transform: translateY(1px); }
  .cr-card__media { display: inline-flex; align-items: center; justify-content: center;
    width: 38px; height: 38px; border-radius: var(--radius); background: var(--accent-soft);
    color: var(--accent); font-size: 16px; margin-bottom: var(--space-3); }
  .cr-card__title { font-size: var(--text-md); font-weight: var(--weight-semibold); margin: 0 0 var(--space-1); }
  .cr-card__body { color: var(--muted); font-size: var(--text-base); line-height: var(--leading-ui); margin: 0; }
  `
  document.head.appendChild(el)
}

export function Card(props) {
  const { raised = false, interactive = false, icon, title, children, className = '', ...rest } = props
  const cls = ['cr-card', raised ? 'cr-card--raised' : '', interactive ? 'cr-card--interactive' : '', className]
    .filter(Boolean).join(' ')
  const Tag = interactive ? 'button' : 'div'
  return (
    <Tag className={cls} {...rest}>
      {icon && <span className="cr-card__media"><i className={icon} aria-hidden="true"></i></span>}
      {title && <p className="cr-card__title">{title}</p>}
      {children && <div className="cr-card__body">{children}</div>}
    </Tag>
  )
}
