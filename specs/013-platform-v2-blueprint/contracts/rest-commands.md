# Contract: REST commands

Base path `/api/v1`. JSON bodies validated with class-validator; every mutating
request MAY carry `Idempotency-Key: <uuid>` (defaults to the client-minted entity
id) — a repeat with the same key returns the first result. Responses for commands
are small acks: `{ id, updatedAt }` or `{ ok: true }` — never a view (reads go
through GraphQL or sync).

Auth column: `public` · `user` (JWT, kind user) · `admin` (JWT, role admin) ·
`service` (service token). Errors: `400` validation, `401` no/invalid credential,
`403` wrong principal kind or role, `404`, `409` conflict (stale `baseUpdatedAt`,
duplicate), `422` domain rule (e.g. allergen), `429` throttled.

## Identity & Access (PostgreSQL)

| Method & path | Auth | Body → Result |
|---|---|---|
| `POST /auth/register` | public | `{ email, password, passwordConfirm, displayName?, locale? }` → `{ accessToken, refreshToken, user }`; refused when `ALLOW_REGISTRATION=false`; password ≥ 8; confirm must match (client and server) |
| `POST /auth/login` | public | `{ login /* email or username */, password, device?: { installId, kind, name } }` → tokens |
| `POST /auth/google` | public | `{ idToken, device? }` → tokens (server verifies with Google; creates account if allowed) |
| `GET /auth/google/start` · `GET /auth/google/callback` | public | OAuth code flow for web and `chrome.identity.launchWebAuthFlow` |
| `POST /auth/refresh` | public | `{ refreshToken }` → new pair; reuse of a rotated token revokes the family |
| `POST /auth/logout` | user | `{ refreshToken }` → `{ ok }` |
| `POST /auth/password` | user | `{ currentPassword, newPassword, newPasswordConfirm }` → `{ ok }`; revokes all refresh tokens |
| `POST /devices` | user | `{ installId, kind, name?, fcmToken? }` → `{ id }` (idempotent per installId) |
| `DELETE /devices/:id` | user | → `{ ok }` |
| `DELETE /me` | user | `{ password? }` → `{ ok }`; emits `UserDeleted` |

## Profile

| Method & path | Auth | Body |
|---|---|---|
| `PATCH /profile` | user | `{ displayName?, timezone?, locale?, goal?, experience?, symptoms?, likedFoods?, dislikedFoods?, allergies? }` |
| `POST /profile/photo` | user | multipart `photo` (≤ 5 MB, jpeg/png/webp) → `{ photoPath }` |
| `POST /profile/body-metrics` | user | `{ at?, weightKg?, heightCm?, note? }` |
| `PATCH /preferences` | user | any subset of `user_preferences` fields |

## Planning (tasks & labels)

| Method & path | Auth | Body |
|---|---|---|
| `POST /tasks` | user | `{ id /* uuidv7 */, title, notes?, dueAt?, allDay?, priority, labelId?, recurrence?, estimatedMinutes? }` |
| `PATCH /tasks/:id` | user | any editable field + `baseUpdatedAt` |
| `POST /tasks/:id/complete` · `/reopen` · `/cancel` | user | `{ at? }` |
| `POST /tasks/:id/defer` | user | `{ toDate }` → increments `deferCount` |
| `DELETE /tasks/:id` · `POST /tasks/:id/restore` · `POST /tasks/:id/purge` | user | tombstone / clear / hard-delete (tombstones only) |
| `POST /tasks/rollover` | user | `{ fromDate, toDate, taskIds? }` — explicit carry-over used by the evening ritual |
| `POST /labels` · `PATCH /labels/:id` · `DELETE /labels/:id` | user | `{ id, name, color?, sortOrder? }` |

## Reminders

| Method & path | Auth | Body |
|---|---|---|
| `POST /reminders` | user | `{ id, title, remindAt, leadTimes? }` |
| `PATCH /reminders/:id` | user | `{ title?, remindAt?, leadTimes?, baseUpdatedAt }` |
| `POST /reminders/:id/snooze` | user | `{ minutes }` or `{ until }` |
| `POST /reminders/:id/complete` · `/cancel` · `/reactivate` | user | reactivate requires `{ remindAt }` |
| `DELETE /reminders/:id` · `POST /reminders/:id/restore` · `POST /reminders/:id/purge` · `DELETE /reminders/deleted` | user | |

## Notifications

| Method & path | Auth | Body |
|---|---|---|
| `POST /notifications/test` | user | `{ deviceId? }` → sends a test push |
| `POST /internal/notifications/sweep` | service (`internal:sweep`) | → `{ claimed, sent, skippedLocal, expired, purged }` |

## Daily Rhythm

| Method & path | Auth | Body |
|---|---|---|
| `POST /rhythm/plans/:date/confirm` | user | `{ taskIds, training?: boolean }` |
| `POST /rhythm/plans/:date/skip` | user | |
| `POST /rhythm/checkins` | user | `{ date?, mood?, adhered?, note? }` |
| `POST /internal/rhythm/tick` | service (`internal:tick`) | → `{ evening: n, morning: n, users: n }` |
| `POST /internal/rhythm/prompt` | service | `{ userId?, kind: 'evening'\|'morning' }` — unconditional, for an operator pressing Run |

## Conversations (chat)

| Method & path | Auth | Body |
|---|---|---|
| `POST /conversations` | user | `{ id, title? }` (kind `free`) |
| `PATCH /conversations/:id` | user | `{ title?, pinned?, archived?, baseUpdatedAt }` — `coach`/`planner` cannot be unpinned |
| `POST /conversations/:id/clear` | user | sets `clearedUpToSeq` |
| `DELETE /conversations/:id` | user | refused for `coach`/`planner` (`403 protected`) |
| `POST /conversations/batch` | user | `{ messages: [{ conversationId, clientId, text, composedAt }] }` ≤ 20 → `{ accepted: [clientId], replies: [{ conversationId, seq }] }`; one reply per conversation; interpreted as of `composedAt` |
| `POST /quick-questions` · `DELETE /quick-questions/:id` | user | `{ scope, text }` (user-added) |

Live turns go over WebSocket — see `ws-chat.md`.

## Meetings & Calendar

| Method & path | Auth | Body |
|---|---|---|
| `POST /meetings` | user | `{ id, title, description?, startAt, durationMin, allDay?, location: { onlineLink?, address? }, prepNotes?, prepMinutes?, reminderOffsets?, recurrence?: { rrule, until? \| count? } }` |
| `PATCH /meetings/:id` | user | series edit + `baseUpdatedAt` |
| `POST /meetings/:id/occurrences/:originalStart/skip` | user | adds exdate |
| `POST /meetings/:id/occurrences/:originalStart/move` | user | `{ startAt, durationMin? }` adds/updates override |
| `POST /meetings/:id/complete` · `/cancel` | user | |
| `DELETE /meetings/:id` · `POST /meetings/:id/restore` | user | |
| `POST /calendar/events` · `PATCH /calendar/events/:id` · `DELETE /calendar/events/:id` | user | `{ id, title, startAt, endAt, allDay?, notes?, color?, recurrence? }` |

## Training

| Method & path | Auth | Body |
|---|---|---|
| `PUT /athlete/sports` | user | `{ sports: string[] }` |
| `PUT /athlete/slots` | user | `{ slots: [{ id, weekday, start, durationMin, sport, location? }] }` → re-materialises upcoming sessions |
| `POST /sessions` | user | `{ id, plannedAt, durationMin, sport, title, focus?, exercises? }` |
| `PATCH /sessions/:id` | user | edits + `baseUpdatedAt` |
| `POST /sessions/:id/log` | user | `{ exercises: [{ id, sets: [{ actualReps?, actualWeightKg?, ..., done }] }], notes? }` |
| `POST /sessions/:id/complete` · `/cancel` · `/skip` | user | |
| `POST /programs` · `PATCH /programs/:id` · `POST /programs/:id/apply` · `POST /programs/:id/archive` · `DELETE /programs/:id` | user | apply: `{ startDate }` fills upcoming slot sessions from week templates |
| `POST /workouts` · `PATCH /workouts/:id` · `DELETE /workouts/:id` | user | library items |

## Knowledge

| Method & path | Auth | Body |
|---|---|---|
| `POST /links` | user | `{ id, url, tags? }` → `{ id, kind, status: 'queued' }` |
| `POST /links/:id/retry` | user | |
| `DELETE /links/:id` | user | tombstone; children of a playlist follow |
| `POST /suggestions/:id/accept` | user | `{ sessionId? }` → creates/fills a session |
| `POST /suggestions/:id/dismiss` | user | |
| `POST /internal/knowledge/ingest/:linkId` | service (`internal:ingest`) | manual re-run of one link |

## Nutrition

| Method & path | Auth | Body |
|---|---|---|
| `POST /meals` · `PATCH /meals/:id` · `DELETE /meals/:id` | user | `{ id, name, kind, ingredients?, tags? }` |
| `POST /nutrition/today/regenerate` | user | regenerates today's meal line (respects `mealMode`, allergies) |

## Sync

| Method & path | Auth | Body |
|---|---|---|
| `POST /sync` | user | see `sync.md` |

## Operations & Admin

| Method & path | Auth | Body |
|---|---|---|
| `PATCH /admin/settings/:key` | admin | `{ value }` validated by the registry schema; `ops.*` keys refused |
| `POST /admin/users/:id/role` | admin | `{ role }` |
| `POST /admin/users/:id/ban` · `/unban` | admin | |
| `POST /admin/service-clients` · `DELETE /admin/service-clients/:id` | admin | `{ name, scopes }` → token shown once |
| `POST /admin/workflows/:id/activate` · `/deactivate` · `/run` | admin | proxied to n8n; run fires the companion webhook |
| `POST /admin/knowledge/:linkId/retry` | admin | |
| `POST /internal/alerts` | service (`internal:alerts`) | `{ workflow, error }` → pushes to admin devices |
| `GET /health` | public | `{ status: 'ok'\|'degraded', postgres, mongo, ollama, push, jobs: { [job]: { lastOkAt, stale } } }` |
| `GET /media?sig=…` | user | signed proxy for external images (SSRF-guarded) |
| `GET /profile/photo` | user | own photo bytes |
