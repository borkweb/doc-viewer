import React from 'react'

const STYLE_ID = 'cr-searchresult-styles'
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = `
  .cr-result { display: block; width: 100%; text-align: left; background: none; border: 0;
    cursor: pointer; color: var(--fg); border-radius: var(--radius);
    padding: var(--space-2) var(--space-3); transition: background var(--transition); }
  .cr-result:hover { background: var(--accent-soft); }
  .cr-result__head { font-weight: var(--weight-semibold); font-size: var(--text-base);
    display: flex; align-items: center; gap: var(--space-2); }
  .cr-result__head i { color: var(--accent); font-size: 11px; }
  .cr-result__meta { font-size: var(--text-sm); color: var(--muted); margin-top: 2px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cr-result__snippet { font-size: var(--text-sm); color: var(--muted); margin-top: 3px;
    line-height: var(--leading-ui);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .cr-result__snippet mark { background: var(--mark-bg); color: var(--fg); border-radius: 2px; padding: 0 1px; }
  `
  document.head.appendChild(el)
}

export function SearchResult(props) {
  const { heading, docTitle, docPath, snippet, className = '', ...rest } = props
  const cls = ['cr-result', className].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} {...rest}>
      <div className="cr-result__head">
        <i className="fa-solid fa-hashtag" aria-hidden="true"></i>
        <span>{heading || docTitle}</span>
      </div>
      <div className="cr-result__meta">{docTitle}{docPath ? ` · ${docPath}` : ''}</div>
      {snippet != null && (
        <div className="cr-result__snippet" dangerouslySetInnerHTML={{ __html: snippet }}></div>
      )}
    </button>
  )
}
