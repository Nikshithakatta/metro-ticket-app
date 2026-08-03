# MetroCity Tickets

Metro ticket reservation MVP: plan a journey on a 2-line network, mock-pay, get a signed QR ticket, and validate it once at a simulated gate.

## Stack

- **API:** Node.js + Express + SQLite (`better-sqlite3`)
- **UI:** React (Vite) + React Router
- **City:** fictional MetroCity (Blue + Green lines, interchange at Central)
- **CI/CD:** GitHub Actions + optional Render Docker deploy

## Quick start (local)

### 1. API

```bash
cd server
npm install
npm run seed
npm run dev
```

API: http://localhost:4040

### 2. Web app

```bash
cd client
npm install
npm run dev
```

UI: http://localhost:5173 (proxies `/api` → `:4040`)

### 3. Production-style (API + built UI on one port)

```bash
npm run build --prefix client
npm run seed --prefix server
npm start --prefix server
```

Open http://localhost:4040

## CI/CD

### Continuous Integration

Workflow: `.github/workflows/ci.yml`

On every push/PR to `main` / `master`:

1. Install server + client deps  
2. Seed SQLite  
3. Build React client  
4. Start API and run **smoke tests** (health → journey → book → pay → validate → reject reuse)  
5. Upload `client/dist` artifact  

Local smoke (server must be running):

```bash
npm run seed --prefix server
npm start --prefix server   # other terminal
npm run smoke --prefix server
```

### Continuous Delivery

Workflow: `.github/workflows/deploy.yml`

- Runs after **CI succeeds** on `main`/`master`, or via **workflow_dispatch**
- Rebuilds the app
- If secret `RENDER_DEPLOY_HOOK_URL` is set, triggers a [Render Deploy Hook](https://render.com/docs/deploy-hooks)

Also included:

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage image (client build + Node API + seed) |
| `render.yaml` | Blueprint for a Render Docker web service |

**Enable Render CD**

1. Push this repo to GitHub  
2. Create a Render Web Service from `Dockerfile` (or use `render.yaml`)  
3. In Render → service → **Deploy Hook** → copy URL  
4. GitHub repo → **Settings → Secrets → Actions** → add `RENDER_DEPLOY_HOOK_URL`  
5. Optionally create environment `production` (deploy workflow references it)

Env vars on the host:

```bash
PORT=4040
NODE_ENV=production
TICKET_HMAC_SECRET=<strong-random-secret>
```

## Features

| Feature | Details |
|---------|---------|
| Journey planner | Shortest path (BFS), hops, ETA, transfers |
| Fare | ₹10 + ₹5 per hop after the first |
| Booking | `pending` → mock pay → `paid` |
| Ticket | HMAC-signed QR, valid 120 minutes |
| Gate | Mark ticket `used` once; reject reuse/expiry |
| History | Recent bookings + ticket links |

## Sample API

```bash
curl http://localhost:4040/api/health
curl "http://localhost:4040/api/journey?from=university&to=airport"
```

## Project layout

```text
metro-ticket-app/
  .github/workflows/   CI + Deploy
  Dockerfile
  render.yaml
  server/              Express API + SQLite + smoke script
  client/              React booking UI
```

## Notes

- Payments are **mocked** (always succeed).
- Re-run `npm run seed` in `server/` to reset network data (also clears bookings/tickets).
- Change `TICKET_HMAC_SECRET` for stronger QR signatures in production.
- SQLite file lives under `server/data/` (gitignored); use a persistent disk on Render for multi-restart demos.
