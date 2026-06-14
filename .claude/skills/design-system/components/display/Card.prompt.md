A surface container for grouped content — project cards, empty states, settings panels.

```jsx
<Card icon="fa-solid fa-book" title="Doc Viewer" interactive>
  18 documents · updated 2h ago
</Card>
<Card raised title="No project selected">Add a local directory or GitHub repo to begin.</Card>
```

`interactive` turns the whole card into a button with an accent-glow hover; `raised` adds elevation. Compose freely via children.
