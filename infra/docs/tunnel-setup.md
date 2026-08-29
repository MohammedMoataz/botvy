# Cloudflare named tunnel setup (feature 001-foundation, User Story 3)

This replaces the old reference stack's quick-tunnel + watchdog.sh hack
(rotating `*.trycloudflare.com` hostname) with a stable, named hostname —
no watchdog process needed.

**Requires**: a domain managed in a Cloudflare account (free plan is
enough).

## One-time setup (done by the user — needs Cloudflare account access)

1. `cloudflared tunnel login` — opens a browser, authorizes against your
   Cloudflare account.
2. `cloudflared tunnel create botvy` — creates the tunnel, prints a tunnel
   ID, writes a credentials JSON file locally.
3. In the Cloudflare Zero Trust dashboard → Networks → Tunnels → `botvy` →
   **Public Hostname**:
   - Hostname: `botvy.<your-domain>` (pick anything; this becomes
     `BOTVY_PUBLIC_HOSTNAME` in `.env`)
   - Service: `http://gateway-stub:80` for now (Feature 001) — becomes
     `http://gateway:8080` once the real gateway exists (Feature 002+)
4. Get the tunnel token: Zero Trust dashboard → the tunnel → **Configure**
   → copy the token from the install command it shows you (the long
   string after `--token`), or run `cloudflared tunnel token botvy`.
5. Put it in `.env`:
   ```
   TUNNEL_TOKEN=<paste here>
   BOTVY_PUBLIC_HOSTNAME=botvy.<your-domain>
   ```

## Bringing the tunnel up

The `cloudflared` service in `infra/docker-compose.yml` is gated behind the
`tunnel` compose profile — it does **not** start with a plain
`docker compose up -d` (so local development never depends on having a
domain configured):

```powershell
docker compose --env-file ..\.env -f infra\docker-compose.yml --profile tunnel up -d
```

## Verification

```powershell
# From a device OUTSIDE this LAN (phone on mobile data, etc.):
curl https://<BOTVY_PUBLIC_HOSTNAME>/          # should reach gateway-stub's placeholder response

# From the same external vantage point — these must FAIL (connection refused/timeout):
curl http://<this-machine's-public-IP>:5679/   # n8n — must not be reachable
curl http://<this-machine's-public-IP>:5432/   # postgres — must not be reachable
```

Postgres and n8n are bound to `127.0.0.1` in `docker-compose.yml`, so they
have no public-IP route to fail against in the first place — the only way
they could become reachable is a future change accidentally binding them
to `0.0.0.0`. Treat any such change as a constitution violation (Principle
V: Single Public Surface) requiring explicit justification.
