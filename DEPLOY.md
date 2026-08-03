# MetroCity on Render — enable CD

CI already runs on every push. This guide turns on **auto-deploy after CI succeeds**.

```text
git push → GitHub Actions CI (must be green) → Deploy workflow
        → Render Deploy Hook → Render builds Dockerfile → live URL
```

Render does **not** deploy on every raw push. `autoDeploy` is off so only a **green CI** can trigger production.

---

## Prerequisites

- GitHub repo: `Nikshithakatta/metro-ticket-app` (or your fork)
- Free [Render](https://render.com) account
- CI passing on `main`

---

## Step 1 — Create the Render web service

### Option A: Blueprint (recommended)

1. Open [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**
2. Connect the GitHub account/repo `metro-ticket-app`
3. Render reads `render.yaml` at the repo root
4. Apply the blueprint → service **metrocity-tickets** is created
5. Wait for the first Docker build to finish
6. Open the service URL (e.g. `https://metrocity-tickets.onrender.com`)
7. Check `https://<your-service>.onrender.com/api/health` → `{"ok":true,...}`

### Option B: Manual Docker service

1. **New** → **Web Service**
2. Connect `metro-ticket-app`
3. Runtime: **Docker**
4. Dockerfile path: `./Dockerfile`
5. Instance: Free (or Starter)
6. Health check path: `/api/health`
7. Environment:
   - `NODE_ENV` = `production`
   - `TICKET_HMAC_SECRET` = generate a long random string  
   - Do **not** force `PORT` — Render sets it automatically
8. **Auto-Deploy**: set to **No** (Deploy Hook will deploy after CI)
9. Create Web Service

---

## Step 2 — Create a Deploy Hook

1. Render → your **metrocity-tickets** service
2. **Settings** → **Deploy Hook**
3. **Create Deploy Hook** (or copy existing URL)
4. Copy the URL — looks like:  
   `https://api.render.com/deploy/srv/...?key=...`

Treat it like a password.

---

## Step 3 — Add the GitHub secret

1. GitHub → repo → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
3. Name: `RENDER_DEPLOY_HOOK_URL`
4. Value: paste the Deploy Hook URL
5. Save

---

## Step 4 — Verify CD

```bash
# empty commit to trigger CI → Deploy
git commit --allow-empty -m "chore: verify Render CD"
git push origin main
```

1. **Actions** → **CI** must go green  
2. **Actions** → **Deploy** should run and log `Deploy hook accepted`  
3. Render dashboard shows a new deploy  
4. Hit `/api/health` and open the site root (booking UI)

You can also run **Deploy** manually: Actions → Deploy → **Run workflow**.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Deploy says secret not set | Re-check secret name is exactly `RENDER_DEPLOY_HOOK_URL` |
| Render build fails on `better-sqlite3` | Ensure Dockerfile uses the repo `Dockerfile` (includes `g++` / `python3`) |
| Health check fails | Confirm health path is `/api/health` and app uses `process.env.PORT` |
| Site sleeps / slow first load | Free tier spins down after idle; first request can take ~30–60s |
| Deploy runs but Render builds old commit | Confirm Auto-Deploy is off and hook redeploys **latest** from the connected branch |

---

## Local Docker check (optional)

```bash
cd /Users/admin/Desktop/metro-ticket-app
docker build -t metrocity-tickets .
docker run --rm -p 4040:4040 -e PORT=4040 metrocity-tickets
# open http://localhost:4040
```
