# AGENTS.md

## Repository: kube-workspaces/frontend

Next.js frontend for the kube-workspaces platform.

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Commands

```
npm install        # install dependencies
npm run dev        # dev server (port 3000)
npm run build      # production build
npm run lint       # eslint
```

## Key Notes

- Next.js 16 (App Router), React 19, Tailwind v4, TypeScript
- Dark mode uses class strategy (`dark` class on `<html>`)
- React 19 Context API: use `<Context value={...}>` directly (not `<Context.Provider>`)
- Files containing JSX must use `.tsx` extension
- All `fetch()` calls must include `credentials: "include"` (httpOnly cookie auth)
- No setState in useEffect body — use IIFE with cancellation flag pattern
- `server.mjs` (dev) proxies `/api/*`, `/auth/*`, `/proxy/*` to the backend
- `server-prod.mjs` (prod) handles escaped proxy request recovery and `/api/*` + `/auth/*` WebSocket upgrades
- Frontend path blocklist in both servers prevents cookie-based escape recovery from hijacking app routes
- `NEXT_PUBLIC_API_URL` controls API target (defaults `http://localhost:8090`)
- Server components use `API_URL` env var for SSR
- VM console: `src/components/terminal-modal.tsx` toggles serial / SSH / noVNC
  Display modes; `src/lib/use-serial-console.ts` + `src/lib/use-ssh-console.ts`
  provide reconnect/take-over; the modal Minimize button docks it to a bottom
  status bar while keeping the session alive
- VM Reboot lives on the workspace detail page (`src/app/workspaces/[name]/page.tsx`)

## Docker Image

Published to: `ghcr.io/kube-workspaces/frontend`

## CI

- `.github/workflows/ci.yml` — lint + build
- `.github/workflows/docker.yml` — build & push Docker image
