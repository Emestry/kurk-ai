# Staff Dashboard

Staff-facing web dashboard for the room-service platform.

## What it does

- Live kanban of inbound guest requests with status advance, partial delivery, and reject actions.
- Inventory with physical + available counts, restock, adjust, add/edit/remove, and low-stock alerts.
- Rooms + active device sessions with revoke.
- Monthly stocktake reconciliation (physical vs expected, per-item reasons, audit trail).
- Monthly analytics (KPIs, charts, consumption table, reconciliation summary, CSV export).

## Architecture

- Next.js 16 (App Router) + React 19 + TypeScript.
- TanStack Query v5 for REST cache. WebSocket connection at the app-shell level dispatches live events into the cache.
- `better-auth` cookie session; edge proxy (`src/proxy.ts`) gates every route except `/login`.
- Dark-by-default theme (shadcn + Tailwind v4).

## Setup

From the repo root:

```bash
pnpm install
pnpm --filter api db:seed        # seed initial staff user + rooms + inventory
pnpm --filter api dev             # starts the API on :3001
pnpm --filter dashboard dev       # starts the dashboard on :3002
```

Open http://localhost:3002/login and sign in:

- Email: `staff@example.com`
- Password: `staff1234`

## Environment variables

| Variable                 | Required | Description                                  |
|--------------------------|----------|----------------------------------------------|
| `NEXT_PUBLIC_API_URL`    | yes      | Base URL of the api (default http://localhost:3001). |
| `NEXT_PUBLIC_WS_URL`     | yes      | WebSocket URL (default ws://localhost:3001/ws).      |
| `NEXT_PUBLIC_AUTH_URL`   | yes      | Base URL of better-auth (default http://localhost:3001/auth). |

All dashboard variables are public; API secrets live in `apps/api/.env`.

## Scripts

- `pnpm --filter dashboard dev` — dev server on port 3002.
- `pnpm --filter dashboard build` — production build. Smoke gate: this must pass.
- `pnpm --filter dashboard lint` — TypeScript + ESLint check.

## Git workflow

Feature branches (`feature/<desc>`), Conventional Commits, no direct commits to `main`.

## Walkthrough (≤90 seconds)

1. Sign in as staff.
2. On another tab, open the guest app (`apps/web`) for Room 204 and submit "Send up an iron and some extra towels."
3. Watch the card appear on the kanban with a chime.
4. Click Acknowledge → Mark Delivered.
5. Observe inventory decrement and low-stock pip on the Inventory tab.
6. Open the Reports tab to show same-day activity in the charts.
