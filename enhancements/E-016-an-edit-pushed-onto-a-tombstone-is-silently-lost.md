# E-016 — An edit pushed onto a tombstone is accepted and then silently lost

**Area**: architecture · **Status**: open · **Found**: P6, writing Training's sync adapters

## What

`resolveConflict` in `shared/persistence/ports/sync-change.ts` has no clause
about `deletedAt` beyond refusing a purge of a live row. So a pushed `update`
naming a row the server has already tombstoned is **accepted**: the fields are
written onto the tombstone, `deletedAt` is left where it was, and the round trip
reports the id in `accepted`.

The next pull then carries that row as a tombstone — which it must, because on a
delta a tombstone is the only way a deletion travels — and the client's own
obligation is to apply pulls as upserts by id. So the phone overwrites its copy
with the deleted row and the member's edit is gone. Nothing is reported to
anybody: it was not rejected, and by the protocol's own rules the pull that
erases it is behaving correctly.

The shape from the member's side:

1. They delete Thursday's session on the laptop.
2. On the phone, offline, they open the same session — still in their local
   copy, because the deletion has not reached it — and write
   "shoulder still sore, went light".
3. The phone syncs. The note is written to the tombstoned row and acknowledged.
4. The pull replaces the phone's row with the tombstone. The note is nowhere,
   the session is correctly gone, and no screen ever said so.

It applies to every row-shaped entity: tasks, labels, reminders, meetings,
calendar events, and P6's sessions, programs and workouts.

## Why it is not simply a bug

Because **every layer is doing what it was designed to do**, and the design
choices are individually right.

`resolveConflict` exists so that five — now eight — entities implement one
conflict rule rather than five copies of it, and the rule it implements is the
one `contracts/sync.md` writes down. That contract's rule branches on the
*existence* of the server row and on `baseUpdatedAt`, not on whether the row is
a tombstone; the only mention of deletion is `not_deleted`, which guards a
purge. Nothing here is a mis-implementation of the contract — the contract does
not cover the case.

The pull is right too. Filtering tombstones out to protect an unsent edit is the
defect `CLAUDE.md` names first about this transport: a delta lists what changed,
and a deletion that does not travel as a tombstone does not travel at all.

And accepting the write is defensible on its own terms. It is the *conservative*
half of the trade: the member's words are stored rather than refused, and a
member who restores the session finds them there. Planning and Meetings have
behaved this way since P2 and P5 and it has never surfaced, because the window
is narrow — a device has to be offline across a deletion made somewhere else.

P6 drafted the other behaviour and it was **rejected on review, correctly**. The
draft refused an `update` onto a tombstone with `gone` plus the server row, which
tells the phone to overwrite its copy and stop re-sending — an honest answer, and
arguably the better one, since it at least *has* an answer. Two arguments sank
it:

- `/sync` is **one protocol**. Three entities of eight answering a situation one
  way while five answer it another is exactly the defect a client author walks
  into, because they reasonably assume uniformity across a shared conflict rule.
- `contracts/sync.md` defines `gone` as "the row is not there and the op was not
  a create. Nothing to edit; the client deletes its local copy." A tombstone
  **is** there. It is recoverable by `restore`, which is the entire reason a
  tombstone is not a delete — so `gone` would be the protocol's own vocabulary
  used against its own definition.

Which is the shape of thing this directory is for: not a mistake in code, but a
gap in a contract that one phase should not close on behalf of the other seven
entities.

## What it costs

A lost edit, in the window between one device deleting a row and another device
learning about it. Bounded by that window, and the loss is one edit rather than
a corruption — the row is correctly deleted either way, and the member's own
action caused the deletion.

What makes it worth writing down rather than shrugging at is the *silence*. The
protocol has a careful story for every other failure: `stale` carries the server
row so the client can show the member the winner, `invalid` is surfaced to the
member because only they can fix it, `not_deleted` is refused outright. This one
case has no story at all. The member's edit is acknowledged and then removed by
the next correct operation, and the client is given nothing it could raise a
badge from — `accepted` says it worked.

It also grows with the product. Every phase adds row entities (P6 added three,
P8 will add meals and links), every one inherits the gap, and the more of a
member's day lives on the phone the more often a device is offline across
somebody else's deletion.

## What fixing it takes

**One change to `resolveConflict`, plus one line in the contract.** Not one
adapter, and that is the point of the file: eight adapters route through the
shared function, so fixing it there fixes it once and keeps the protocol
uniform, where fixing it in Training's three would have created the divergence
the review rejected.

Three candidate rules, in order of preference:

1. **A new reason, `deleted`.** `contracts/sync.md` gains a sixth verdict:
   the row exists, it is a tombstone, and an edit to it is refused with the
   server row attached. The client's obligation is the one it already has for
   `stale` — overwrite from `server`, show the member what won — plus the
   badge-and-retry suppression it already has for `invalid`, since retrying will
   not help. This is the draft's behaviour with a word that means what it says
   instead of one that does not. Cost: a new vocabulary word crosses the network,
   so the phone needs a branch for it, and a client that does not know it must
   treat an unknown reason as non-retryable — which is worth checking before
   choosing this.
2. **`invalid` with a code.** No new verdict: an edit to a tombstone is refused
   as `invalid`, which every client already handles as "stop and tell the
   member". Cheapest by far, and it abuses `invalid` slightly — the row is not
   malformed, its target is in the wrong state. Given `invalid` is already the
   verdict for `ForeignRowError`, which is also not about the row's contents,
   this is less of a stretch than it first reads.
3. **Keep accepting, and surface it.** Leave the write, and have the response
   name the ids that were applied to a tombstone so the client can raise
   "this session is deleted — restore it to keep your note?". The most generous
   to the member and the most work: a new field on the response, a new client
   flow, and it leaves an edit sitting on a row nobody is looking at.

Whichever is chosen, the change is: the clause in `resolveConflict` (which every
adapter already calls, so no adapter changes), the row in
`contracts/sync.md`'s conflict rule and its rejection-reason list, the phone's
rejection handler, and one case in `sync.spec.ts` — plus deleting the note in
`contexts/training/infrastructure/training-sync.adapters.ts` that points here.

**Recommendation:** option 2 for now, option 1 when the phone's rejection
handling is next opened. And whichever lands, land it with a spec asserting the
*outcome* and not only the verdict — that the row stays deleted and the edit
does not resurrect it. `training-sync.spec.ts` asserts that much today for
sessions ("accepts an edit onto a tombstoned session without resurrecting it")
and it is the only place in the codebase that does, for any entity.
