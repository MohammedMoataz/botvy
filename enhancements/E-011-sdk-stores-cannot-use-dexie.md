# E-011 — The SDK's stores cannot use Dexie, so the extension restated "Today"

**Area**: architecture · **Status**: open · **Found**: P2, building the extension panel

## What

`TasksStore.table` and `LabelsStore.table` are hard-coded
`new MemorySyncTable<T>()` with no way to substitute one — while `TasksStore`'s
own documentation said "the extension replaces it with a Dexie-backed one".

So the extension could not use those stores. It wrote a `DexieSyncTable`
implementing the `SyncTable` port, drove `SyncStore` with it directly, and
**restated `view('today')` in its own code** — which makes that the third
implementation of "what counts as the member's day", after the two server
adapters that were reconciled in this same phase precisely to stop them
disagreeing.

## Why it is not a one-line fix

It was tried, and the obstacle is not the constructor. The stores' read surface
is **synchronous**:

```ts
get rows(): TaskRow[]
byId(id: string): TaskRow | undefined
subscribe(listener: () => void): () => void
```

IndexedDB is asynchronous, and no amount of injection changes that. Taking a
`SyncTable` in the constructor type-checks and then fails on every read, because
those three members are not on the port — they are `MemorySyncTable`'s own, and
they are what the portal's MobX bindings and the panel's React render both
consume.

Making it work means making every store read async, and following that through
`apps/frontend`'s stores and every component that reads them. That is a
refactor, not a fix in passing, which is why the field's comment now states the
position honestly rather than describing an injection that does not exist.

## What it costs

The duplication, and it is the expensive kind: `today` is a *rule* about the
member's day — today's tasks plus everything still open whose moment has passed
— and it now lives in the Mongo read adapter, the in-memory read adapter, the
SDK store and the extension panel. The first two were made to share a predicate
table this phase because they had silently disagreed about null ordering under a
comment claiming they matched. The same drift is now available across four
copies.

## What fixing it takes

Two routes, and the second is probably right.

1. **Make the store reads async** and thread that through the portal. Honest,
   invasive, and it makes the SDK usable from any storage — which is what the
   port was for.
2. **Move the view definitions out of the stores** into a small pure module —
   `taskViews.ts` with `matches(view, row, day)` and a comparator — that every
   surface imports and applies to whatever rows it already has. The stores keep
   their synchronous convenience for the portal; the panel and the phone apply
   the same predicate to Dexie and to drift. One copy of the rule, four callers,
   no async refactor.

Route 2 is smaller and fixes the thing that actually matters, which is the
duplicated rule rather than the storage abstraction. Worth doing before P9 adds
the extension's meetings list and makes it five copies.
