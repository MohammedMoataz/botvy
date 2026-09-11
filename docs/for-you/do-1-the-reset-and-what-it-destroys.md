# Do: the reset — and read what it destroys before you run it

You asked for a clean start: delete the unused Docker things, clear v1's data,
and rebuild v2 from nothing. The script is `infra/reset.mjs` and it does exactly
that, in that order. Read this page first, because two of the deletions are
irreversible and one of them ends a task in the current phase.

---

## Run it in three passes, not one

```powershell
# 1. Say what would happen. Touches nothing at all.
node infra/reset.mjs

# 2. Dump and tar v1. Still deletes nothing.
node infra/reset.mjs --archive

# 3. Delete and rebuild. Refuses unless step 2 ran today.
node infra/reset.mjs --go
```

The archive lands in `..\botvy-v1-archive\<today>\`, beside the repository and
not inside it. Set `BOTVY_ARCHIVE_DIR` to put it somewhere else — an external
disk is a better home for it than the drive it came from.

## What `--go` deletes

**v1, permanently** — its containers and the three named volumes
`botvy_pg_data`, `botvy_n8n_data`, `botvy_searxng_data`. After this, v1 exists
only as the archive from step 2.

**v2's data, permanently** — both stores, the media volume, n8n's volume and
Caddy's. Every account including the administrator, every setting you have
changed from its default, every task, meeting, conversation and saved link.
The next start is a first install: the seeded administrator comes back with the
password in `.env`, and nothing else comes back at all.

Pass `--go --keep-v2` if you want v1 gone and v2's data left alone.

**Unreferenced Docker objects** — stopped containers, unused networks, images
nothing points at, and the build cache. That will reclaim several gigabytes.

## What it will not do

It never runs `docker system prune --volumes`. Every volume it removes is named
in the script, so anything else on this machine — another project's database,
something you are using for work — cannot be caught by a wildcard. If you have
volumes from other projects you also want gone, delete those yourself, by name,
after looking at them.

---

## The thing you need to decide before step 3

**Deleting `botvy_pg_data` ends the banned-member check.**

`docs/parity.md` owes one open item: every member v1 had banned must still be
unable to sign in to v2. That check reads v1's `users` table. Once the volume is
gone the question can never be asked again.

The archive step handles it — it starts v1's postgres on its own, writes
`v1-members.csv` with every account and its status, and tells you how many were
banned. So the answer is simply **run `--archive` and let it finish** before
`--go`, and `--go` refuses to start without it.

But look at the CSV before you continue. If it names members you need to contact
(T1121: tell them what changed, point them at the new build), do that while v1
can still be started, not afterwards.

> **Write the archive path here when you have run it**, and I will record it in
> `docs/parity.md` and `specs/025-hardening-release/tasks.md` (T1122):
>
> ```
> Archive path:
>
> Banned members found:
>
> Members I still need to contact:
> ```

---

## After the reset

```powershell
node infra/bootstrap.mjs
node infra/verify.mjs
```

Then **change the administrator password**. It is the first thing `SETUP.md`
says and it matters more now than it did: the portal is reachable through a
public tunnel, and the seeded password is on every breach word list. The new
rate limits slow a guessing attempt down; they do not make a bad password good.

```
POST /api/v1/auth/password   { currentPassword, newPassword }
```

or from the portal once you are signed in.
