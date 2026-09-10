# E-007 — Undated tasks sort first in the by-label view

**Area**: product · **Status**: open · **Found**: P2, fixing the pagination cursor

## What

Of the six task views, `label` is the only one that carries tasks with no due
date — the others filter on a date range, which excludes null. It sorts by
`(status, dueAt, priority)`, and **MongoDB orders null below every date**, so a
member opening a label sees their undated "some day" tasks above everything with
a deadline.

## Why it is this way

Because the alternative was worse at the time. Sorting nulls last in Mongo needs
an aggregation with `$ifNull` and a computed field, and the in-memory adapter
would then have to reproduce *that* rather than the store's own ordering.

Getting the two adapters to agree was the whole point of the work this was found
during: they had silently disagreed about exactly this, under a comment claiming
they matched, which is how a handler spec ends up proving nothing about
production. Agreeing on Mongo's ordering was the cheap way to make them agree at
all.

## What it costs

A cosmetic ordering nobody chose. Not wrong, exactly — "some day" tasks are
arguably worth seeing — but it was not a decision, and the tasks with actual
deadlines are pushed down the list.

## What fixing it takes

Either:

- **An aggregation pipeline** for that one view: `$addFields` with
  `{ $ifNull: ['$dueAt', <far future>] }`, sort on the computed field, and the
  in-memory comparator matched to it. The keyset cursor already supports an
  arbitrary sort-key list, so paging keeps working.
- **A second sort key before `dueAt`** — a boolean `hasDueDate` stored on the
  row and maintained on every write. Cheaper to query, one more field to keep
  correct, one more thing that can fall out of step.

The first is better: it keeps the derived value derived. Worth doing when
somebody looks at the by-label screen and decides what they want at the top,
which is a design question rather than a technical one.
