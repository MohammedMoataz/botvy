# E-005 — The relay's dispatch table is written by hand

**Area**: architecture · **Status**: open · **Found**: P2 (the risk is P0's, and it has already fired once)

## What

In-process event delivery is a `switch` in `shared/outbox/relay.module.ts`
mapping an event name to a handler call. A handler that is provided in a module
but not named in that switch is **never called, and nothing fails.**

Its own comment says so, because it has already happened: `bootstrap-on-registered`
and `purge-on-deleted` were both in exactly that state, so every account ever
created got no profile and every deleted one left its photo on the volume.

P2 added two rows to it (`planning.LabelUpdated`, `planning.LabelDeleted`), and
the alert planning saga adds roughly a dozen more.

## Why the table exists

Deliberate, and recorded as such: `@EventsHandler` discovery hides *where* an
event goes, and with two handlers a bus was not justified. The comment's own
framing is that the table "grows a row per handler until a phase shows it should
become one".

## What it costs

The failure mode is silence. A phase adds a handler, provides it, writes a spec
that calls it directly — the spec passes — and the handler never runs in
production. The only thing between that and a shipped release is somebody
remembering the switch.

P2 is arguably the phase that shows it should become a bus: the alert planning
saga alone subscribes to more than a dozen event names across four contexts.

## What fixing it takes

Two options, and the second is cheaper than it looks.

1. **A real EventBus with decorator discovery.** `@nestjs/cqrs` is already a
   dependency and already provides one. The cost is that "who handles this
   event" stops being answerable by reading one file.
2. **Keep the table and make the gap loud.** Have each context declare the event
   names it subscribes to, and assert at boot that every declared name has a
   case. A missing row then fails to start rather than failing quietly, which
   removes the whole failure mode while keeping the table's readability.

Option 2 preserves what the table is *for* — seeing the entire event topology in
one place — and removes the only thing wrong with it. It is probably the right
answer, and it is a small piece of work.
