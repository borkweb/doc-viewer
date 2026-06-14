An icon-only chrome control — toolbar actions, the sidebar "add project" button, panel toggles. Borderless and flush by design.

```jsx
<IconButton icon="fa-solid fa-plus" label="Add project" />
<IconButton icon="fa-solid fa-rotate" label="Pull latest" />
<IconButton icon="fa-solid fa-list-tree" label="Toggle tree" active />
```

Always pass `label` for accessibility (also used as the tooltip). Use `active` for toggled state. Sizes `sm` / `md` / `lg`.
