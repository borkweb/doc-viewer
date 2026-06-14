# Themes are app-side config; theme assets are never sourced from a Project's repo

Themes live in the app's own theme library (`userData/themes/*.json`), and any
background image a theme uses is **copied into `userData/themes/assets/`** when the
user picks it. A Project references a Theme by id, but a Project's source repo can
neither ship a theme nor reference one. Themes are purely app-side presentation
config.

We chose this to preserve the untrusted-content boundary the rest of the security
model depends on (DOMPurify-sanitized markdown, mermaid `securityLevel: 'strict'`,
sandboxed orphan HTML, no repo-sourced executable content — see the spec's Security
section). Letting a repo supply a theme or point at local image paths would hand
untrusted input control over the app's chrome and asset loading, which is exactly
the surface we are trying to keep closed.

## Considered Options

- **Repo-shipped themes** (e.g. a `.curator/theme.json` in the repo) — convenient,
  lets projects self-brand their docs, and "just works" on clone. Rejected: it
  reintroduces untrusted, repo-controlled config + asset references into the trust
  boundary, and themes would then have to be re-sanitized/sandboxed.

## Consequences

- Themes behave identically for local and GitHub Projects.
- Theme images survive the original file moving (they're copied + hashed into app
  data).
- Self-branding docs is not supported; a user who wants a per-project look assigns
  one of their app-side themes to that Project instead.
