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
| `POST /auth/register` | public | `{ email, password, passwordConfirm, displayName?, locale? }` → `{ accessToken, refreshToken, user }`; refused when the registry key `auth.registrationOpen` is false; password ≥ 8; confirm must match (client and server) |
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
| `POST /tasks/:id/occurrences/:occurrence/skip` | user | adds an exdate and moves the series to the next occurrence |
| `POST /tasks/rollover` | user | `{ fromDate, toDate, taskIds? }` — explicit carry-over run by the end-of-day touch |
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
| `POST /internal/rhythm/tick` | service (`internal:tick`) | → `{ users, planPrompts, endOfDay, morning, checkins, ms }` (see `internal.md`) |
| `POST /internal/rhythm/prompt` | service | `{ userId?, kind: 'plan'\|'end_of_day'\|'morning' }` — unconditional, for an operator pressing Run |

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
| `POST /meetings` | user | `{ id, title, description?, startAt, durationMin?, location: { onlineLink?, address? }, prepNotes?, prepMinutes?, reminderOffsets?, lockTimezone?, recurrence?: { dtstart?, rrule, exdates?, overrides? }, source? }`. At least one of `onlineLink` and `address` is required (FR-001); no `durationMin` takes `defaults.meetingDurationMin`; no `reminderOffsets` takes the member's `defaults.leadTimes` as minute offsets, resolved **at creation** |
| `PATCH /meetings/:id` | user | series edit + `baseUpdatedAt`, plus `force?: boolean`. Without `force`, an edit that would orphan a moved occurrence answers **409** carrying the orphaned moments, so the client can ask before discarding them (spec edge case); `force: true` is the retry |
| `POST /meetings/:id/occurrences/:originalStart/skip` | user | adds exdate. `:originalStart` is an ISO instant — the moment the *rule* produced, which is the override key and never moves |
| `POST /meetings/:id/occurrences/:originalStart/move` | user | `{ startAt, durationMin? }` adds/updates override. Moving the occurrence that was skipped clears that skip; moving one *onto another's* skipped date does not resurrect it |
| `POST /meetings/:id/complete` · `/cancel` | user | Acts on the meeting, series included. There is deliberately no per-occurrence equivalent: an outcome belongs to the meeting, and a date is skipped or moved (FR-013) |
| `DELETE /meetings/:id` · `POST /meetings/:id/restore` · `DELETE /meetings/:id/purge` | user | Deleting never touches `status`; purge refuses a row that is not a tombstone (`409 not_deleted`) |
| `POST /calendar-events` · `PATCH /calendar-events/:id` · `DELETE /calendar-events/:id` · `POST /calendar-events/:id/restore` · `DELETE /calendar-events/:id/purge` | user | `{ id, title, startAt, endAt, allDay?, notes?, color?, recurrence? }` |
| `POST /calendar-events/:id/occurrences/:originalStart/skip` · `.../move` | user | A repeating personal event skips and moves exactly as a repeating meeting does (FR-011), through the same expander |

The blueprint wrote the second group as `/calendar/events`; P5 renamed it to
`/calendar-events` so that the route, the collection (`calendar_events`), the
sync entity name and the `entity` field of a `/sync` rejection are one word. A
client that has to translate between two spellings of the same thing is a client
that will translate one of them wrongly — and there is no `/calendar` resource
for the path to have hung off.

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
| `POST /nutrition/today/replace` | user | `{ mealId }` — swaps one meal in today's line, keeps the rest |

## Sync

| Method & path | Auth | Body |
|---|---|---|
| `POST /sync` | user | see `sync.md` |

## Operations & Admin

| Method & path | Auth | Body |
|---|---|---|
| `PATCH /admin/settings/:key` | admin | `{ value }` validated by the registry schema; a key whose registry entry is `readOnly` is refused |
| `POST /admin/users/:id/role` | admin | `{ role }` |
| `POST /admin/users/:id/ban` · `/unban` | admin | |
| `POST /admin/service-clients` · `DELETE /admin/service-clients/:id` | admin | `{ name, scopes }` → token shown once |
| `POST /admin/workflows/:id/activate` · `/deactivate` · `/run` | admin | proxied to n8n; run fires the companion webhook |
| `POST /admin/knowledge/:linkId/retry` | admin | |
| `DELETE /admin/knowledge/:linkId` | admin | clears a stuck or failed entry; writes an `audit_log` row |
| `POST /internal/alerts` | service (`internal:alerts`) | `{ workflow, error }` → pushes to admin devices |
| `GET /health` | public | `{ status: 'ok'\|'degraded', postgres, mongo, ollama, push, jobs: { [job]: { lastOkAt, stale } } }` |
| `GET /media?sig=…` | user | signed proxy for external images (SSRF-guarded) |
| `GET /profile/photo` | user | own photo bytes |
