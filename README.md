# kube-workspaces Frontend

Next.js web UI for managing container-based workspaces in Kubernetes.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard with summary cards (workspaces, running, volumes, images) and workspace list |
| `/workspaces` | Workspace table with status badges, start/stop/delete/connect actions |
| `/workspaces/new` | Create workspace form (image selection, resources, volume mounts) |
| `/workspaces/{name}` | Workspace detail with tabs: Overview, Logs, Events, YAML |
| `/volumes` | Volume list with phase badges |
| `/volumes/new` | Create PVC form |
| `/images` | Available workspace images |
| `/admin` | Admin index |
| `/admin/api` | Interactive API documentation (Redoc) |
| `/admin/crds` | Raw CRD browser |

## Features

- **Namespace filtering** - Global selector in nav bar, persisted in localStorage
- **Dark mode** - Class-based toggle with localStorage persistence, no flash on load
- **Workspace proxy** - Connect button opens workspace web UI via `/proxy/` route
- **YAML viewer** - Raw CR and Pod YAML with "Clean" toggle to strip ephemeral fields
- **Real-time updates** - Workspace list auto-refreshes every 5 seconds

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### Pointing to a remote API

Create a `.env.local` file (git-ignored) to proxy requests to a remote API:

```bash
echo 'API_URL=https://api.workspaces.example.com' > .env.local
npm run dev
```

The dev server (`server.mjs`) loads `.env.local` automatically and proxies `/api/*`, `/auth/*`, and `/proxy/*` to the configured `API_URL` (stripping the `/api` prefix, same as the production nginx rewrite).

## Docker

```bash
docker build -t kube-workspaces-frontend:latest -f Dockerfile .
```

## Configuration

| Env Var | Description | Default |
|---------|-------------|---------|
| `API_URL` | Backend API URL (server-side, for rewrites) | `http://kube-workspaces-api` |
| `NEXT_PUBLIC_API_URL` | Backend API URL (client-side) | `` (same origin) |

## Rewrites

The Next.js server proxies these paths to the API service:

| Path | Destination |
|------|-------------|
| `/api/*` | API endpoints |
| `/proxy/*` | Workspace reverse proxy |
| `/admin/*` | Admin endpoints |
| `/healthz` | Health check |
| `/openapi3.*` | OpenAPI specs |
| `/sw.js` | No-op service worker |

## Tech Stack

- Next.js 16 (App Router, standalone output)
- TypeScript
- Tailwind CSS v4 (with `@custom-variant dark` for class-based dark mode)
- Inter font (Google Fonts)
- `yaml` package for YAML rendering

## Key Files

| File | Description |
|------|-------------|
| `src/lib/api.ts` | API client functions |
| `src/lib/theme.tsx` | ThemeProvider (dark mode context) |
| `src/lib/namespace.tsx` | NamespaceProvider (global namespace filter) |
| `src/components/providers.tsx` | Combined context providers |
| `src/components/nav-bar.tsx` | Navigation with namespace selector and dark mode toggle |
| `src/app/globals.css` | Tailwind config, custom variant, base font size |
| `src/app/layout.tsx` | Root layout with providers |
| `next.config.ts` | Rewrites configuration |

## Related Repositories

| Repository | Description |
|------------|-------------|
| [kube-workspaces/controller](https://github.com/kube-workspaces/controller) | Kubernetes controller (CRD reconciliation) |
| [kube-workspaces/api](https://github.com/kube-workspaces/api) | REST API service |
| [kube-workspaces/proxy](https://github.com/kube-workspaces/proxy) | Workspace reverse proxy |
| [kube-workspaces/deploy](https://github.com/kube-workspaces/deploy) | Deployment manifests and documentation |

## License

Apache License 2.0
