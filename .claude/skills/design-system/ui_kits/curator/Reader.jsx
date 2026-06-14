/* Curator reading pane — renders a Document and its toolbar.
   Mermaid blocks are shown as a styled placeholder canvas (the real app renders
   them with mermaid + svg-pan-zoom). */
const { Button, Badge } = window.CobaltReaderDesignSystem_feb28f

function Reader({ project, doc, docPath, scrollToId }) {
  const ref = React.useRef(null)

  React.useEffect(() => {
    const root = ref.current
    if (!root) return
    // Turn ```mermaid code fences into a diagram placeholder canvas.
    root.querySelectorAll('code.language-mermaid').forEach((code) => {
      const wrap = document.createElement('div')
      wrap.className = 'dv-diagram'
      wrap.innerHTML = '<div class="dv-diagram-head"><i class="fa-solid fa-diagram-project"></i> Diagram · click to expand</div>'
      const pre = code.closest('pre')
      pre.replaceWith(wrap)
    })
    if (scrollToId) {
      const el = root.querySelector('#' + CSS.escape(scrollToId))
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [docPath, scrollToId])

  if (!project) {
    return (
      <main className="dv-content dv-content--empty">
        <div className="dv-empty">
          <i className="fa-solid fa-book-open"></i>
          <p className="dv-empty-title">Add or select a project to begin</p>
          <p className="dv-empty-sub">Curator reads documentation from a local directory or a GitHub repository.</p>
        </div>
      </main>
    )
  }
  if (!doc) {
    return (
      <main className="dv-content dv-content--empty">
        <div className="dv-empty">
          <i className="fa-solid fa-file-lines"></i>
          <p className="dv-empty-title">Select a document</p>
          <p className="dv-empty-sub">Pick a file from the tree, or search across {project.name}.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="dv-content">
      <div className="dv-toolbar">
        <span className="dv-crumb">{project.name}<i className="fa-solid fa-chevron-right"></i>{doc.title}</span>
        <div className="dv-toolbar-actions">
          {project.ref && <Badge tone="accent" icon="fa-solid fa-code-branch">{project.ref}</Badge>}
          {project.type === 'github'
            ? <Button size="sm" variant="secondary" icon="fa-solid fa-rotate">Pull latest</Button>
            : <Button size="sm" variant="ghost" icon="fa-solid fa-rotate">Reindex</Button>}
        </div>
      </div>
      <article ref={ref} className="cobalt-doc dv-article"
        dangerouslySetInnerHTML={{ __html: doc.html }}></article>
    </main>
  )
}

window.DVReader = Reader
