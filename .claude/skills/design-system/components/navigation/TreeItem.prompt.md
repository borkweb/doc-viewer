A single row in the document navigation tree — a Document or a folder.

```jsx
<TreeItem kind="folder" label="adr" open depth={0} />
<TreeItem kind="md" label="Domain model" depth={1} active />
<TreeItem kind="html" label="coverage report" depth={1} />
```

`kind` picks the icon (`md` → file, `html` → html5, `folder` → folder + chevron). `active` marks the open Document; `depth` controls indentation; `open` rotates the folder chevron.
