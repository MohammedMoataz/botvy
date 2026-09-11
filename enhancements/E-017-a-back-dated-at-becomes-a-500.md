# E-017 — A back-dated `at` on a status command becomes a 500

**Area**: build · **Status**: open · **Found**: P6, by a fixture that chose its own clock

## What

Every status command in Meetings and Training accepts an optional `at` — "when
the member says it happened" — and passes it to the aggregate:

```ts
POST /api/v1/sessions/:id/complete   { at?: string }
POST /api/v1/meetings/:id/cancel     { at?: string }
```

The aggregate uses that one value for two different things:

```ts
complete(at = new Date()) {
  this.status = 'completed';
  this.completedAt = at;   // a fact about the world
  this.updatedAt = at;     // the optimistic-write column
}
```

`MongoRepositoryBase.save` filters on `updatedAt: { $lte: aggregate.updatedAt }`.
So an `at` **older than the row's current `updatedAt`** makes the filter miss,
the save throws `StaleWriteError`, and the member gets a **500** — for a request
that was perfectly well formed and would have been perfectly reasonable to
honour.

It is reachable with one curl: complete a session with yesterday's timestamp.

## Why it is not simply a bug to fix in P6

Three reasons, and the third is the one that decided it.

**It is not P6's.** The identical shape is in Meetings from P5, and the same
conflation of "when it happened" with "when the row last changed" is in
Planning's `Task` and Reminders' aggregate. P6 duplicated a pattern; it did not
invent one.

**The proper fix is a semantic decision, not a patch.** `at` is two things
wearing one name. The right shape is almost certainly that `at` sets only the
*domain* fact — `completedAt`, `deletedAt` — while `updatedAt` is always the
server's own `now`, because `updatedAt` is not a fact about the member's day at
all: it is the optimistic-concurrency column and the sync cursor, and letting a
client move it backwards is letting a client lose its own next write. Making
that change means touching four aggregates and being sure nothing reads
`updatedAt` as a domain timestamp, which is a review of every synced read.

**And the half-fix is worse than the gap.** Correcting it in Training alone
would give two contexts two answers to one situation, which is exactly the
inconsistency ruled against elsewhere in this phase for the sync verdicts:
`/sync` is one protocol and the REST commands are one surface, and a client
author reasonably assumes uniformity.

## What it costs

Less than a reachable 500 usually would, because **the path that matters does
not go through it.** A member completing a session on an offline phone syncs
through `/sync`, and the sync adapters treat a pushed status as a *report* of a
transition the phone already applied — they write the fields and stamp
`updatedAt` with the server's `now`, exactly as this file recommends the
commands should. So the offline case, which is the only case with a genuinely
old timestamp in it, is already correct.

What is left is the REST command with an explicit `at`, and nothing in the
product sends one: the phone uses `/sync`, the extension does not complete
sessions, and the chat's executor passes `now`. The field is unused surface.

The real cost is therefore a latent one. It is a 500 rather than a 4xx, so it
would page somebody rather than telling the caller what was wrong; and it is
exactly the sort of thing a third-party client or a future feature would find by
sending the timestamp it has rather than the timestamp the server wants.

## What fixing it takes

**The right fix, in one change across four aggregates.** `at` sets the domain
timestamp; `updatedAt` becomes the server's `now` in every mutating method.
Then check every read that surfaces `updatedAt` — `/sync`'s cursor, the
`baseUpdatedAt` conflict rule, the admin views — and confirm none of them wanted
the member's clock. That last part is the work; the edit itself is a dozen
lines.

**A cheaper mitigation that changes no semantics**: clamp forward at the point
of assignment, so `updatedAt` can only ever move later. Tempting as a one-line
change to `AggregateRoot`, and it is a trap there — `rehydrate` assigns an
`updatedAt` *older* than the field's `new Date()` default, so a forward-only
setter on the base class would refuse to load any row that had not been touched
this instant. Done per-aggregate it works and it is four small edits, but it
leaves the conflation in place for the next person to read.

**Or remove `at` from the commands.** It is unused, and deleting unused surface
is the cheapest correctness win available. It would need a note in
`rest-commands.md` and a decision about whether any future client wants to
back-date a completion — which is a real product question, because "I did that
session on Tuesday" is a thing a member might well want to say.

**Recommendation:** do the proper fix in a phase that is already reviewing the
synced reads — P11's hardening is the natural home — and until then leave it,
because the only reachable path is a field nothing sends. Do **not** fix it in
one context.
