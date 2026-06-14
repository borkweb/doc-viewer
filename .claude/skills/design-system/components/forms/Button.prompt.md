Cobalt Reader's button — use for any clickable action; reserve the filled `primary` variant for the single most important action in a view.

```jsx
<Button variant="primary" icon="fa-solid fa-rotate">Pull latest</Button>
<Button variant="secondary">Reindex</Button>
<Button variant="ghost" icon="fa-solid fa-gear" />
<Button variant="danger" icon="fa-solid fa-trash">Remove project</Button>
```

Variants: `primary` (filled accent, glows on hover), `secondary` (slate fill + border), `ghost` (transparent chrome control), `danger` (outlined error). Sizes: `sm` / `md` / `lg`. Pass Font Awesome class strings to `icon` / `iconRight`. `fullWidth` stretches to the container.
