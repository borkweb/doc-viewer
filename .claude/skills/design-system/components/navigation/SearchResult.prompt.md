A single search hit in the sidebar results list — one matched Section of a Document.

```jsx
<SearchResult
  heading="Rebuild"
  docTitle="Domain model"
  docPath="docs/03-domain-model.md"
  snippet='The operation that re-runs a Project's <mark>pipeline</mark>…' />
```

`snippet` accepts HTML so matched terms can be wrapped in `<mark>` (cyan highlight). Heading falls back to `docTitle` for intro sections.
