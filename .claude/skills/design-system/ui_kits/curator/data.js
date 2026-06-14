/* Fake data for the Curator UI kit — modeled on the real app's domain
   (Projects, Documents, Sections, Refs) and its own CONTEXT.md content. */
(function () {
  const projects = [
    { id: 'p1', name: 'Curator', type: 'local', docCount: 18, status: 'ok', sub: 'Local · ~/projects/curator' },
    { id: 'p2', name: 'React', type: 'github', docCount: 342, status: 'ok', ref: 'main', sub: 'github.com/reactjs/react.dev' },
    { id: 'p3', name: 'Tailwind CSS', type: 'github', docCount: 211, status: 'building', ref: 'v4', sub: 'Pull latest in progress…' }
  ]

  const tree = [
    { type: 'doc', path: 'README.md', title: 'Overview', kind: 'md' },
    { type: 'folder', name: 'concepts', path: 'concepts', children: [
      { type: 'doc', path: 'concepts/domain-model.md', title: 'Domain model', kind: 'md' },
      { type: 'doc', path: 'concepts/projects.md', title: 'Projects & sources', kind: 'md' },
      { type: 'doc', path: 'concepts/search.md', title: 'Search & sections', kind: 'md' }
    ] },
    { type: 'folder', name: 'adr', path: 'adr', children: [
      { type: 'doc', path: 'adr/0001-electron.md', title: '0001 · Use Electron', kind: 'md' },
      { type: 'doc', path: 'adr/0002-themes.md', title: '0002 · Theme system', kind: 'md' }
    ] },
    { type: 'doc', path: 'coverage.html', title: 'coverage report', kind: 'html' }
  ]

  const docs = {
    'README.md': {
      title: 'Overview',
      html: `
        <h1>Curator</h1>
        <p>A desktop app for browsing, navigating, and searching documentation drawn from
        local directories or GitHub repositories, one selectable <a href="#">Project</a> at a time.</p>
        <h2 id="what">What it does</h2>
        <p>Point Curator at a folder or a repo and it discovers every markdown file,
        splits each <mark>Document</mark> into searchable Sections, and renders it with
        live diagrams and full-text search.</p>
        <ul>
          <li>Local directories stay current via a file-watcher.</li>
          <li>GitHub Projects cache multiple <strong>Refs</strong> and switch between them.</li>
          <li>A per-Project Theme can override the global look.</li>
        </ul>
        <h2 id="quickstart">Quick start</h2>
        <pre><code>$ curator ./docs
Indexed 18 documents · 142 sections
Watching for changes…</code></pre>
        <blockquote>Local content is read live — there is nothing to fetch. "Reindex" just
        rebuilds the in-memory nav tree and Section index.</blockquote>
      `
    },
    'concepts/domain-model.md': {
      title: 'Domain model',
      html: `
        <h1>Domain model</h1>
        <p>The vocabulary Curator is built around. A <mark>Project</mark> is the top-level
        unit; everything else hangs off it.</p>
        <h2 id="entities">Core entities</h2>
        <table>
          <thead><tr><th>Term</th><th>Definition</th></tr></thead>
          <tbody>
            <tr><td>Project</td><td>A named documentation source plus its processed doc set and search index.</td></tr>
            <tr><td>Document</td><td>A single viewable file surfaced within a Project.</td></tr>
            <tr><td>Section</td><td>A heading-delimited chunk of a Document — the unit of search.</td></tr>
            <tr><td>Ref</td><td>A git branch, tag, or commit of a GitHub Project's repo.</td></tr>
          </tbody>
        </table>
        <h2 id="relationships">Relationships</h2>
        <pre><code class="language-mermaid">graph LR
  Project --> Document
  Document --> Section
  Project --> Ref</code></pre>
        <h3 id="rebuild">Rebuild</h3>
        <p>One internal operation, two surface labels: <strong>Pull latest</strong> for GitHub
        (re-clones remote content) and <strong>Reindex</strong> for local (rebuilds the index).</p>
      `
    },
    'concepts/projects.md': {
      title: 'Projects & sources',
      html: `
        <h1>Projects &amp; sources</h1>
        <p>A <mark>Project</mark> has exactly one source: a local directory or a GitHub repo.
        Its identity excludes its Ref — the same repo on two branches is one Project.</p>
        <h2 id="local">Local projects</h2>
        <p>Content is read live from disk and kept current by a file-watcher. Use
        <strong>Reindex</strong> only as a recovery action.</p>
        <h2 id="github">GitHub projects</h2>
        <p>Cloned and cached per Ref. The branch switcher moves between cached Refs;
        <strong>Pull latest</strong> re-fetches the current Ref.</p>
      `
    },
    'concepts/search.md': {
      title: 'Search & sections',
      html: `
        <h1>Search &amp; sections</h1>
        <p>Each <mark>Section</mark> is one search record. A result points at one Section's
        heading anchor, so opening it scrolls straight to the match.</p>
        <h2 id="sections">What counts as a Section</h2>
        <p>Documents are split at H1–H3 boundaries. Content before the first heading is an
        intro Section anchored to the top.</p>
        <pre><code>minisearch.search("rebuild", { prefix: true, fuzzy: 0.2 })</code></pre>
      `
    },
    'adr/0001-electron.md': {
      title: '0001 · Use Electron',
      html: `
        <h1>ADR 0001 — Use Electron</h1>
        <p><strong>Status:</strong> Accepted</p>
        <h2 id="context">Context</h2>
        <p>We need a cross-platform desktop app with local filesystem access and a web
        rendering surface for markdown and diagrams.</p>
        <h2 id="decision">Decision</h2>
        <p>Build on Electron with a Vite + React renderer and a typed preload bridge.</p>
      `
    },
    'adr/0002-themes.md': {
      title: '0002 · Theme system',
      html: `
        <h1>ADR 0002 — Theme system</h1>
        <p><strong>Status:</strong> Accepted</p>
        <h2 id="context">Context</h2>
        <p>Users want visual distinction between Projects and a comfortable reading surface.</p>
        <h2 id="decision">Decision</h2>
        <p>A Theme is a palette of CSS custom-property overrides, applied globally and
        optionally per-Project. <em>Cobalt Reader</em> is one such Theme.</p>
      `
    }
  }

  // Flattened sections for search.
  const sections = [
    { docPath: 'concepts/domain-model.md', docTitle: 'Domain model', heading: 'Rebuild', headingId: 'rebuild', snippet: 'One internal operation, two surface labels: <mark>Pull latest</mark> for GitHub and Reindex for local.' },
    { docPath: 'concepts/projects.md', docTitle: 'Projects & sources', heading: 'GitHub projects', headingId: 'github', snippet: 'Cloned and cached per <mark>Ref</mark>. Pull latest re-fetches the current Ref.' },
    { docPath: 'concepts/search.md', docTitle: 'Search & sections', heading: 'What counts as a Section', headingId: 'sections', snippet: 'Documents are split at H1–H3 boundaries. Content before the first heading is an intro <mark>Section</mark>.' },
    { docPath: 'concepts/domain-model.md', docTitle: 'Domain model', heading: 'Core entities', headingId: 'entities', snippet: 'A <mark>Section</mark> is a heading-delimited chunk of a Document — the unit of search.' },
    { docPath: 'README.md', docTitle: 'Overview', heading: 'What it does', headingId: 'what', snippet: 'Splits each Document into searchable <mark>Sections</mark> and renders it with live diagrams.' }
  ]

  window.DV_DATA = { projects, tree, docs, sections }
})()
