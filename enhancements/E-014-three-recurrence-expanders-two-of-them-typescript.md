# E-014 — Three recurrence expanders, and two of them are TypeScript

**Area**: architecture · **Status**: open · **Found**: P5, wiring the extension

## What

Occurrences are derived from a rule and never stored (FR-006), so every surface
that draws a calendar has to expand the rule itself. After P5 there are three
implementations:

| Where | Language | Rule parsing |
|---|---|---|
| `backend/src/contexts/meetings/domain/recurrence-expander.ts` | TypeScript | `rrule` |
| `packages/sdk/src/recurrence.ts` | TypeScript | hand-rolled subset |
| `mobile/lib/core/recurrence/expander.dart` | Dart | `rrule` (Dart) |

The Dart one is not the problem: `plan.md`'s complexity table already argues for
it, the phone must answer with the network off (FR-010), and shipping expanded
occurrences down the sync channel is exactly the materialisation FR-006 forbids.
Both expanders are held to one fixture table, case for case, so a divergence
fails the phone's tests.

The **second TypeScript** one is the thing worth a file. It exists because the
extension bundles from `packages/sdk`, which is browser-safe ESM and cannot
import backend source, and because `rrule` is CommonJS — the backend needs a
`const { RRule } = rrule` interop dance to use it at all, and pulling it into an
all-ESM extension bundle for a seven-day list is a poor trade. So the SDK's copy
hand-rolls a **documented subset**: `FREQ` daily/weekly/monthly/yearly with
`INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` for weekly, `BYMONTHDAY` including `-1`
for monthly. Everything that is not the parser — both zones, floating wall-clock
expansion, minute-matched exdates and override keys, window orphans, the
spring-forward correction — mirrors the server case for case, and its own spec
reproduces the server's fixture table.

## Why it is not simply a bug

Because the subset is **the whole set of rules the product can currently
produce.** The repeat picker writes `FREQ=…;INTERVAL=…;BYDAY=…;COUNT=…` and
nothing else; there is no way for a member to author a `BYSETPOS` rule, and the
chat's `set_meeting` builds from the same vocabulary. So the parser is complete
for its input, and the duplication is two implementations of a *specification*
rather than two guesses at one.

Nor is it the duplication the constitution warns about. Its rule — duplicate
over share, move to `shared/` on the third copy — is about one runtime's code.
These are three runtimes, and the shared kernel that would hold one copy does
not span them.

## What it costs

**The failure mode is a wrong answer, not an error.** An unparseable rule
degrades to the series' single first occurrence, matching the server's own
fallback for a rule `rrule` refuses. On the server that case means a row written
by an older build; in the SDK it would mean a rule the parser does not know —
and a weekly series rendering as one meeting is a member reading their side
panel and believing they are free on Friday.

Today that cannot happen, because nothing writes such a rule. It becomes
reachable the moment anything does: a "last Friday of the month" option in the
picker (`BYSETPOS=-1;BYDAY=FR`), an import from an external calendar, or a rule
repaired by hand in the database. None of those is in a phase's scope yet, and
P5 is the phase that would have caught it — which is why the file exists now
rather than after the fact.

The second cost is quieter: three places to fix a semantic defect. The
`authoredTimezone` correction this phase made mid-flight would have been three
edits rather than one, and the fixture tables are what make the third edit
discoverable.

## What fixing it takes

**Extract the expander into `packages/contracts` or a new `packages/recurrence`,
and have the backend import it.** The logic is pure — dates in, occurrences out,
no store, no DI — and the only thing tying it to the backend is `shared/time`,
which is four small functions that would move with it. The backend then has one
TypeScript expander and the SDK re-exports it. What has to be solved first is
`rrule`: either the shared package takes the CJS interop hit (it already works
in the backend, and a bundler resolving it for the browser is the untested
half), or the hand-rolled parser becomes the *only* one and is completed to the
subset the product will ever write, with the server's `rrule` dependency
dropped. The second is more work and leaves fewer moving parts.

**Or: make the subset's boundary loud instead of silent.** Cheap, and worth
doing whichever way the above goes — `parseRule` returning null is currently
indistinguishable from a rule that genuinely has one occurrence. A rule the SDK
cannot read should surface as "this series cannot be shown here" in the panel
and a warning in the console, so a future picker option fails visibly on the
first render rather than by drawing a plausible wrong week. This is a few lines
in `packages/sdk/src/recurrence.ts` and one branch in `Meetings.tsx`.

**Or: leave the SDK reading the server.** The extension is online whenever the
panel is open, and `agenda(from, to)` already answers exactly this question.
That was rejected for P5 because the panel caches in Dexie precisely so it opens
instantly and survives a service worker that has been asleep — the same argument
as FR-010 for the phone, one notch weaker.

**Recommendation:** do the loud boundary now, in P9 when the extension is
actually built out, and take the extraction only if a picker option or an
external-calendar import lands. Two implementations of a closed specification,
each with the other's fixture table, is a stable place to be; two
implementations where one silently guesses is not.
