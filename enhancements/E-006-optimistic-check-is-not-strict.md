# E-006 — The optimistic write check admits an equal timestamp

**Area**: persistence · **Status**: open · **Found**: P2, reading `MongoRepositoryBase`

## What

`shared/persistence/mongo/mongo-repository.base.ts` guards a save with

```js
$or: [{ updatedAt: { $lte: aggregate.updatedAt } }, { updatedAt: { $exists: false } }]
```

`$lte`, not `$lt`. A save whose `updatedAt` is *exactly* the stored row's is
accepted. The in-memory adapter agrees — `existing.updatedAt > aggregate.updatedAt`
throws, equal does not — so the two are at least consistent.

## Why it is not a defect

Two writes landing in the same millisecond on one aggregate is rare, and where
it matters most the code does not rely on this check at all: the sync facade has
its own conflict rule with an explicit `baseUpdatedAt` comparison, and the alert
claim is a `findOneAndUpdate` filtered on `claimedAt: null`, which is atomic
regardless.

`$lte` is also not simply a mistake — the same-instant case is genuinely
ambiguous, and admitting it means a handler that reads and writes inside one
millisecond does not fail for a reason nobody can reproduce.

## What it costs

A lost update, in the narrow window where two writers hold copies of one
aggregate whose `updatedAt` is identical. The second write wins and the first is
gone with no error. As more handlers write the same aggregate, the window
widens.

## What fixing it takes

Not `$lt` on its own — that would make a same-millisecond save fail rather than
merge, which is a different bug and a noisier one.

The real fix is a **version counter**: an integer on every aggregate, incremented
on save, with the filter matching the version the copy was loaded at. Standard,
no timestamp resolution to lose, and it needs a migration to backfill the
column plus a change to the repository base and both adapters. Worth doing once,
before a context arrives whose aggregate several handlers write concurrently.
