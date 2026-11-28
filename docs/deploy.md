# Deploy PracticeRoom (production)

Live production app (always-on HTTPS):

**https://hirepro-nandini.fly.dev/**

Health: `https://hirepro-nandini.fly.dev/api/v1/health`

This stays online on Fly.io so other users can open it anytime. A laptop Docker + Cloudflare tunnel is only for temporary sharing.

## Architecture

One production image (`Dockerfile` target **`runtime-prod`**):

| Piece | Role |
|-------|------|
| Nest API | Auth, sessions, interview orchestration |
| Python `room_worker` | Prepare / reply / transcribe (spawned by the API) |
| Built React UI | Static files under nginx |
| nginx | Listens on **8080**, proxies `/api/` → `127.0.0.1:3000` |
| SQLite volume | `/data` → Fly volume `practice_room_data` |

Config: [`fly.toml`](../fly.toml) — app `hirepro-nandini`, region **`sin`** (Singapore; `bom` is not a Fly region).

Local compose still uses two services (`api` + `web` on host **8080**) — see Option B.

## Option A — Fly.io (current production)

### Prerequisites

- Fly account: [sign in](https://fly.io/app/sign-in) / [sign up](https://fly.io/app/sign-up)
- Fly CLI (`flyctl`)
- Groq (or OpenAI-compatible) API key

### Install CLI (Windows)

```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

CLI path (after install):

```powershell
& "$env:USERPROFILE\.fly\bin\flyctl.exe" version
```

### 1. Log in

```powershell
& "$env:USERPROFILE\.fly\bin\flyctl.exe" auth login
```

### 2. Create app + volume (once)

App names are **global**, lowercase, digits and dashes only (e.g. `hirepro-nandini` — not `practiceRoom` or a name already taken like `practice-room`).

```powershell
cd C:\Users\NANDINI\Desktop\HirePro
& "$env:USERPROFILE\.fly\bin\flyctl.exe" apps create hirepro-nandini
& "$env:USERPROFILE\.fly\bin\flyctl.exe" volumes create practice_room_data --app hirepro-nandini --region sin --size 1 --yes
```

Always pass **`--app hirepro-nandini`** on volume create (otherwise you may get `unauthorized`).

If the app name is taken, change `app` in `fly.toml` and use that name everywhere.

### 3. Set secrets

```powershell
& "$env:USERPROFILE\.fly\bin\flyctl.exe" secrets set -a hirepro-nandini `
  PRACTICE_ROOM_LLM_KEY="YOUR_GROQ_KEY" `
  PRACTICE_ROOM_LLM_BASE="https://api.groq.com/openai/v1" `
  PRACTICE_ROOM_LLM_MODEL="llama-3.3-70b-versatile" `
  CORS_ORIGIN="https://hirepro-nandini.fly.dev"
```

Use the same key as in local `.env`. Never commit real keys.

### 4. Deploy

```powershell
& "$env:USERPROFILE\.fly\bin\flyctl.exe" deploy -a hirepro-nandini
```

### 5. Open and verify

```powershell
& "$env:USERPROFILE\.fly\bin\flyctl.exe" open -a hirepro-nandini
& "$env:USERPROFILE\.fly\bin\flyctl.exe" status -a hirepro-nandini
& "$env:USERPROFILE\.fly\bin\flyctl.exe" logs -a hirepro-nandini
```

Or visit **https://hirepro-nandini.fly.dev/** — expect UI `200` and health JSON `status: ok`.

`auto_stop_machines = "off"` and `min_machines_running = 1` keep one machine always up.

### Redeploy after code changes

```powershell
& "$env:USERPROFILE\.fly\bin\flyctl.exe" deploy -a hirepro-nandini
```

### Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Site times out / “refused connection on 8080” | Process crashed before nginx bound. Check `fly logs`. Startup must `exec nginx` in the foreground (`deploy/start-prod.sh`). Do **not** use `wait -n` (invalid in `/bin/sh`). |
| `Name has already been taken` | Pick another lowercase-dash name; update `fly.toml`. |
| `region bom not found` | Use **`sin`** (or another region from `flyctl platform regions`). |
| Volume `unauthorized` | Add `--app hirepro-nandini`. |
| Interviews fail to prepare | Secrets missing — re-run `fly secrets set` with a valid LLM key. |
| Login cookies fail on HTTPS | Production sets `COOKIE_SECURE=true`; UI and API are same-origin via nginx. |

Monitoring: https://fly.io/apps/hirepro-nandini/monitoring

---

## Option B — Local Docker (dev / LAN only)

```powershell
cd C:\Users\NANDINI\Desktop\HirePro
copy .env.example .env
# set PRACTICE_ROOM_LLM_KEY in .env
docker compose up --build
```

Open **http://localhost:8080** (not `:5173` — that is Vite dev only).

- Stops when the PC sleeps.
- Cloudflare quick tunnel (`cloudflared tunnel --url http://localhost:8080`) is temporary and changes URL each run.

---

## Option C — VPS (DigitalOcean, Hetzner, …)

```bash
docker build --target runtime-prod -t practice-room .
docker run -d --name practice-room -p 80:8080 \
  --env-file .env \
  -e COOKIE_SECURE=true \
  -e CORS_ORIGIN=https://your-domain.com \
  -v practice_data:/data \
  practice-room
```

Put TLS (Caddy / nginx) in front for HTTPS on 443.

---

## Environment

| Variable | Purpose |
|----------|---------|
| `PRACTICE_ROOM_LLM_KEY` | Groq / OpenAI-compatible key |
| `PRACTICE_ROOM_LLM_BASE` | e.g. `https://api.groq.com/openai/v1` |
| `PRACTICE_ROOM_LLM_MODEL` | e.g. `llama-3.3-70b-versatile` |
| `CORS_ORIGIN` | Public HTTPS origin (`https://hirepro-nandini.fly.dev`) |
| `COOKIE_SECURE` | `true` on HTTPS (`runtime-prod` sets this) |
| `PRACTICE_ROOM_DATA_DIR` | `/data` (volume) |
| `PRACTICE_ROOM_AI_SERVICE` | Path to Python `apps/ai-service` |
| `PORT` | Nest listen port inside the container (`3000`) |
| `VITE_API_URL` | Empty string at web build time → same-origin `/api` |

Never commit `.env` or real API keys.
