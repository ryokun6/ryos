# Dual Deployment Guide (Vercel + VPS API)

This project now supports running the same API handlers on:

1. **Vercel** (existing `_api/*` serverless deployment), and
2. **VPS** (standalone Node/Bun API process).

## Overview

- API handlers remain in `_api/*`.
- VPS entrypoint: `server/index.ts` (imports `server/vps-api-server.ts`).
- VPS adapter normalizes Node HTTP requests/responses into a Vercel-compatible shape.
- Health endpoint is available at `/api/health`.

---

## Environment variables

Core variables (same as Vercel):

- `REDIS_KV_REST_API_URL`
- `REDIS_KV_REST_API_TOKEN`
- provider keys (`OPENAI_API_KEY`, etc.)
- real-time keys (`PUSHER_*`)

Dual-runtime / CORS variables:

- `APP_ENV=production|preview|development`
- `ALLOWED_ORIGINS` (comma-separated, allowed in all envs)
- `ALLOWED_PREVIEW_ORIGINS` (preview-only allowlist)
- `ALLOWED_DEV_ORIGINS` (development-only allowlist)

Frontend override:

- `VITE_API_BASE_URL=https://api.example.com` when frontend and API are split-host.
- `VITE_APP_ENV=production|preview|development` (optional client runtime hint)
- `VITE_ANALYTICS_PROVIDER=vercel|none` (`none` disables analytics event emission)

---

## Local run (VPS mode)

```bash
bun run dev:vps
```

Production-like local run:

```bash
APP_ENV=production ALLOWED_ORIGINS=https://your-frontend.example.com bun run start:vps
```

Health check:

```bash
curl -i http://127.0.0.1:3001/api/health
```

---

## systemd service example

Create `/etc/systemd/system/ryos-api.service`:

```ini
[Unit]
Description=ryOS API (VPS mode)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/srv/ryos
Environment=NODE_ENV=production
Environment=APP_ENV=production
Environment=PORT=3001
Environment=ALLOWED_ORIGINS=https://os.ryo.lu,https://your-frontend.example.com
ExecStart=/usr/local/bin/bun run start:vps
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ryos-api
sudo systemctl status ryos-api
```

---

## Nginx reverse proxy example

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    # ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Optional geo headers your provider/proxy may set
        # proxy_set_header X-Geo-Country $geoip2_data_country_code;
        # proxy_set_header X-Geo-Region $geoip2_data_subdivision_1_name;
        # proxy_set_header X-Geo-City $geoip2_data_city_name;
    }
}
```

---

## Deployment workflow

1. Deploy frontend (Vercel/static host).
2. Deploy API process to VPS (`bun run start:vps` via systemd).
3. Set frontend `VITE_API_BASE_URL` to VPS API origin if cross-hosted.
4. Validate:
   - `/api/health`
   - auth endpoints
   - chat streaming
   - songs endpoints
   - backup endpoints

---

## Rollback

If VPS API rollout fails:

1. Set frontend API base back to the Vercel origin.
2. Redeploy frontend config only.
3. Keep VPS running for troubleshooting without serving production traffic.
