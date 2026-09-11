# E-018 — A job's cadence lives in a table somewhere else

**Area**: build · **Status**: open · **Found**: P6, by `/health` reporting `degraded`

## What

`assessHealth` decides a job is stale after `settings.ops.staleAfterMinutes`
(fifteen minutes) — except for nightly jobs, which get `backupStaleHours`
(forty-eight). Which jobs are nightly is a **list in the health module**:

```ts
const NIGHTLY_JOBS = new Set([
  'backup.mongo', 'backup.postgres',
  'notifications.meeting-alerts',   // P5
  'training.materialise',           // P6
]);
```

So the fact "this job runs once a night" is written down in a file that has
nothing to do with the job, and the job itself — the controller, the workflow,
the handler that stamps the heartbeat — says nothing about it.

## Why it is not simply a bug

It was one, twice, and both times the *shape* was the cause rather than the
value.

The window itself had to exist: judged by the minute rule, a backup that ran
successfully at 03:00 reported the platform degraded from 03:15 and failed the
platform gate's "no stale jobs" check every day. That was fixed in an earlier
phase with a **name prefix**, `backup.`.

Then P5 added the nightly `notifications.meeting-alerts` and P6 the nightly
`training.materialise`. Neither name begins with `backup.`, so both were judged
by the fifteen-minute window and both were permanently stale — the original
defect, restored, by a fix whose shape encoded cadence as a property of a name.
CLAUDE.md already records the same trap in the settings registry, where refusing
`ops.*` by prefix also froze `ops.staleAfterMinutes`.

The set is a genuine improvement on the prefix: it is explicit, it is in one
visible place, and it fails in the safe direction — a nightly job somebody
forgets to list reports stale, which is loud, where a five-minute job wrongly
listed would go quiet for a day unnoticed. It is not the *right* place, and that
is what this file is about.

## What it costs

**A third nightly job added without touching this file is a job that reports
the platform broken for twenty-three hours a day.** P7's ingestion sweep and
P11's retention pass are both plausible candidates. The failure is loud, so it
will be noticed — but "noticed" means somebody spends an afternoon on a health
signal rather than on the phase they were building, and it is the second time
the same afternoon has been spent.

The subtler cost is the one a permanently-red signal always has. `/health`
answering `degraded` when nothing is wrong is worth less than no signal at all,
because it trains an operator to stop reading it — and this platform's whole
argument for heartbeats is that a silent 401 between n8n and the gateway once
went unnoticed for days.

## What fixing it takes

**Let the job declare its own cadence when it stamps.** `HeartbeatService.stamp`
gains an expected interval, `ops_heartbeats` gains the column, and
`assessHealth` compares against the row rather than against a table:

```ts
await this.heartbeats.stamp(MEETING_ALERTS_JOB, ok, error, { everyHours: 24 });
```

Three consequences, and they are the reason it is not a five-minute change:

1. **`ops_heartbeats` needs the column declared**, and the collection is written
   through `MongoRepositoryBase` — a path the schema does not declare is an
   upsert Mongoose *rejects outright*, which has shipped twice in this project.
   So the schema, the mapper and `schemas.spec.ts` all move together.
2. **Every stamp site is edited**, including the backup container's, which
   reaches `ops_heartbeats` through `POST /internal/ops/heartbeat` and would
   need the field on that contract too.
3. **A row written before the column existed has no cadence**, so the fallback
   has to be the minute window — which is the safe default and also means the
   migration is "do nothing and let the next stamp fill it in".

**A cheaper variant**: keep the decision in code but move it next to the job, by
exporting the cadence beside the existing `*_JOB` name constant and having the
health module import them. It removes the "somewhere else" without a schema
change, at the cost of the health module importing from four contexts — which
is a direction constitution IX would want a hard look at.

**Recommendation:** do the first, in P11's hardening, where the operator surfaces
are already being reviewed. Until then the set is correct and its comment says
what to think about before adding a name to it.
