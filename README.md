# Kube Workspaces Frontend

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Release](https://img.shields.io/github/v/release/kube-workspaces/frontend?logo=github)](https://github.com/kube-workspaces/frontend/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/kube-workspaces/frontend/ci.yml?branch=main&label=CI&logo=github)](https://github.com/kube-workspaces/frontend/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/github/actions/workflow/status/kube-workspaces/frontend/docker.yml?branch=main&label=Docker%20image&logo=docker&logoColor=white)](https://github.com/kube-workspaces/frontend/actions/workflows/docker.yml)
[![GHCR Image](https://img.shields.io/badge/image-ghcr.io%2Fkube-workspaces%2Ffrontend-2496ED?logo=docker&logoColor=white)](https://github.com/kube-workspaces/frontend/pkgs/container/frontend)

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

Next.js web UI for managing container-based workspaces in Kubernetes.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard with summary cards (workspaces, running, volumes, images) and workspace list |
| `/workspaces` | Workspace table with status badges, start/stop/delete/connect actions |
| `/workspaces/new` | Create workspace form (image selection, resources, volume mounts) |
| `/workspaces/{name}` | Workspace detail with tabs: Overview, Pod, Metrics, Logs, Events, YAML |
| `/workspaces/{name}/console` | In-browser terminal console (xterm.js) |
| `/volumes` | Volume list with phase badges |
| `/volumes/new` | Create PVC form |
| `/volumes/{name}` | Volume detail |
| `/images` | Available workspace images |
| `/images/{name}` | Image detail |
| `/login` | Login page |
| `/profile` | User profile |
| `/docs/godoc` | Embedded Go documentation |
| `/admin` | Admin index |
| `/admin/api` | Interactive API documentation (Redoc) |
| `/admin/crds` | Raw CRD browser |
| `/admin/{images,map,namespaces,platform,poddefaults,settings,users}` | Admin management pages |

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

The dev server (`server.mjs`) loads `.env.local` automatically and proxies `/api/*` and `/auth/*` to the configured `API_URL` (stripping the `/api` prefix, same as the production nginx rewrite), and `/proxy/*` to `PROXY_URL`.

## Docker

```bash
docker build -t kube-workspaces-frontend:latest -f Dockerfile .
```

## Configuration

| Env Var | Description | Default |
|---------|-------------|---------|
| `API_URL` | Backend API URL (dev server proxy target) | `http://localhost:8090` |
| `PROXY_URL` | Workspace proxy service URL (dev and prod servers) | `http://localhost:8091` |
| `NEXT_PUBLIC_API_URL` | Backend API URL (client-side) | `` (same origin) |

## Proxy Routing

Custom Node servers wrap Next.js and proxy these paths (there are no `next.config.ts` rewrites):

| Path | Dev (`server.mjs`) | Prod (`server-prod.mjs`) |
|------|--------------------|--------------------------|
| `/api/*` | Forwarded to `API_URL` (prefix stripped) | Handled upstream |
| `/auth/*` | Forwarded to `API_URL` | Handled upstream |
| `/proxy/*` | Forwarded to `PROXY_URL` | Forwarded to `PROXY_URL` |
| `/sw.js` | Served from `public/` | No-op service worker served directly |

The production server additionally recovers "escaped" requests from proxied workspaces (using the `Referer` header and `kw-proxy-prefix` cookie) and upgrades WebSockets for both proxied and escaped paths.

## Tech Stack

- [Next.js 16](https://nextjs.org) (App Router, standalone output)
- [React 19](https://react.dev)
- [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS v4](https://tailwindcss.com) (with `@custom-variant dark` for class-based dark mode)
- [xterm.js](https://xtermjs.org) (workspace terminal console)
- [Recharts](https://recharts.org) and [D3](https://d3js.org) (charts and topology map)
- [react-markdown](https://github.com/remarkjs/react-markdown) (docs rendering)
- [yaml](https://eemeli.org/yaml/) package for YAML rendering
- Google Fonts: Inter, Michroma, Exo 2, Rajdhani

## Key Files

| File | Description |
|------|-------------|
| `server.mjs` | Dev server with API/proxy forwarding |
| `server-prod.mjs` | Production server wrapper (proxy routing, escaped request recovery) |
| `src/lib/api.ts` | API client functions |
| `src/lib/auth.tsx` | AuthProvider (session context) |
| `src/lib/theme.tsx` | ThemeProvider (dark mode context) |
| `src/lib/namespace.tsx` | NamespaceProvider (global namespace filter) |
| `src/components/providers.tsx` | Combined context providers |
| `src/components/nav-bar.tsx` | Navigation with namespace selector and dark mode toggle |
| `src/app/globals.css` | Tailwind config, custom variant, base font size |
| `src/app/layout.tsx` | Root layout with providers |
| `next.config.ts` | Next.js config (standalone output) |

## Related Repositories

| Repository | Description |
|------------|-------------|
| [kube-workspaces/controller](https://github.com/kube-workspaces/controller) | Kubernetes controller (CRD reconciliation) |
| [kube-workspaces/api](https://github.com/kube-workspaces/api) | REST API service |
| [kube-workspaces/proxy](https://github.com/kube-workspaces/proxy) | Workspace reverse proxy |
| [kube-workspaces/deploy](https://github.com/kube-workspaces/deploy) | Deployment manifests and documentation |

## License

Apache License 2.0
