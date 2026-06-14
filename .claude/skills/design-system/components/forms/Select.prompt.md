A native dropdown with a chevron. Used for the sidebar project switcher (`flush`) and content forms (boxed).

```jsx
<Select flush placeholder="Select a project…"
  options={[{value:'1',label:'Doc Viewer'},{value:'2',label:'React docs'}]} />
```

Pass `options` as strings or `{value,label}` objects, or supply `<option>` children directly. All native select props pass through (`value`, `onChange`).
