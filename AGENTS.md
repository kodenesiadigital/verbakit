# PressForge

WordPress-like CMS running fully on Cloudflare. Plugin-extensible.

## Repository layout
- `apps/api` — Cloudflare Worker (REST API, D1, R2, KV)
- `apps/admin` — React SPA admin dashboard
- `packages/core` — hooks/filters registry, plugin loader, shared types
- `packages/plugin-sdk` — SDK for plugin authors
- `plugins/*` — installable plugins (registered at build via `npm run build:registry`)
- `scripts/generate-registry.mjs` — scans `plugins/`, emits `apps/api/src/plugins/registry.ts`

## Commands (run from repo root)
- `npm install`
- `npm run build:registry` — regenerate plugin registry
- `npm run typecheck` — typecheck all workspaces
- `npm run build` — registry + api + admin build
- `npm run dev:api` — `wrangler dev` (local D1/miniflare, no CF auth required)
- `npm run dev:admin` — vite dev server (proxies `/api` to the worker)

## Cloudflare deployment
- Account owner email: `cakrawangsamegantara@gmail.com`
- Do NOT reuse API keys from other projects. Authenticate by running
  `npx wrangler login` (browser OAuth) before any deploy.
- Deploy target: `apps/api` worker + `apps/admin` static assets.

## Conventions
- TypeScript strict everywhere; ESM (`"type": "module"`).
- No server-side secrets in code — use `.dev.vars` / secrets / bindings.
- curl must use `--noproxy "*"` on this machine.