# Changes to things you already had

Foundation phase (P0), `specs/014-foundation`.

What this phase altered outside the new v2 tree: your `.env`, the ports, v1's CI, `CLAUDE.md`. Nothing here is a new file — it is the list of things that were already yours and are now different.

---

### 2.1 `.env` — extended, not replaced. Backup taken.

**Backup**: `.env.backup-before-v2-20260907T200952Z` — restore that file if you
dislike any of this.

Four variables carry the **same name in both versions and must hold different
values**. Overwriting them in `.env` would break the v1 stack that is still
running and still serving phones:

| Variable | v1 needs | v2 needs | Why |
|---|---|---|---|
| `DATABASE_URL` | `localhost:5432` | `postgres:5432` | v1's gateway reaches PostgreSQL from the host; v2's backend runs inside the compose network, where `localhost` is the container itself. |
| `OLLAMA_BASE_URL` | `.../v1` | no suffix | v1 uses the OpenAI-compatible shim. v2 uses the native API because the shim drops `format`, `think` and `num_ctx` — the three things schema-constrained extraction and the one-context-size rule depend on. |
| `FIREBASE_CREDENTIALS_DIR` | relative to `legacy/infra/` | relative to `infra/` | Same relative path, different starting directory. |
| `CORS_ORIGINS` | two Vite dev servers | empty | v2 is same-origin behind Caddy and needs no allowance at all. |

**What I did**: appended v2's 14 non-conflicting variables to `.env`, and put
the four conflicting ones in a new `.env.v2` that v2's compose reads *second*,
so its values win without touching v1's.

```bash
docker compose --env-file .env --env-file .env.v2 -f infra/docker-compose.yml up -d
```

Both files are gitignored. **`SETUP.md` still says `cp infra/.env.example .env`**,
which on your machine would overwrite a running system's configuration. I have
not changed that line, because the right fix depends on which arrangement you
want:

- **(a) Two files, as now.** Least disruptive. Cost: every v2 command carries two
  `--env-file` flags, and it is easy to forget one.
- **(b) One file per stack.** `.env` becomes v2's; v1 gets `legacy/.env`. Cleanest
  long term, but you must update however you currently start v1.
- **(c) Prefix v2's variables** (`BOTVY_V2_DATABASE_URL`…). No collisions ever,
  but it diverges from the blueprint's environment contract and every later
  phase inherits the prefix.

I would pick **(b)** once v1's decommissioning date is in sight, and stay on
**(a)** until then. Tell me which and I will make it consistent across
`SETUP.md`, the compose file and the release workflow.

### 2.2 Ports shifted, but the two stacks still cannot run at once

v2's edge is on **8090** (not 80) and its n8n editor on **127.0.0.1:5680** (not
5679), because v1 holds the lower ones. Both are `.env` values, so change them
freely. `infra/verify.mjs` counts only non-loopback publishes, so the n8n
loopback bind does not violate the one-public-port rule.

**I wrote earlier in this file that the shifted ports let both stacks run side
by side. That was wrong, and I found out by looking at the running system.**
Both compose files declare `name: botvy`, so they are not two stacks — they are
one project, and the volumes they share by name are `pg_data` and `n8n_data`.
(v1 has no MongoDB, so `mongo_data` and `media` are v2's own.) Bringing v2 up replaced v1's container definitions in place. Your v1
containers `botvy-gateway-1` and `botvy-searxng-1` are still there, exited,
untouched; nothing was deleted.

For Identity this is what the plan actually asks for — `research.md` says
accounts and refresh tokens carry over in the same PostgreSQL — and they have:
the `botvy` database still holds v1's thirteen tables, `users` and
`refresh_tokens` among them. What is not intended is running the two at the same
time, which two servers on one data directory will not survive. See §1.6 for the
part that needs your decision.

### 2.3 v1's CI moved to `legacy/.github/`

The phase's task list did not mention it. It referenced `@botvy/gateway` and a
root `package.json` that is now v2's, so leaving it in place would have run a
red build on every push. It is preserved for reference and no longer executes.

### 2.4 `CLAUDE.md` gained five rules and lost two stale claims

New rules, each written from a bug in this phase or the review before it:
un-editable is a flag not a key prefix; a capability three phases each credit to
another phase is a capability nobody builds; an event with consumers and no
producer is dead documentation; plus the two from the remediation pass.

Corrected: the constitution reference said v2.0.0 (it is v2.1.1), and the
"where things are" section described the v2 layout as a plan when it is now on
disk.

---
