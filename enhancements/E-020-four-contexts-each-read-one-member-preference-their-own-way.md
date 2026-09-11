# E-020 — Four contexts each read one member preference their own way

**Area**: architecture · **Status**: open · **Found**: P7, writing the fourth
identical adapter

## What

Four contexts need one field from `user_preferences`, and each of them declares
its own port and binds its own four-line adapter to Profile's published read:

| Phase | Context | Port | Field |
|---|---|---|---|
| P2 | Notifications | `MemberContextPort.alertPreferences` (in `shared/`) | `leadTimes`, `quietHours` |
| P5 | Meetings | `MeetingDefaultsPort` | `defaultMeetingDurationMin` |
| P6 | Training | `NextPracticeCutoffPort` | `nextPracticeCutoff` |
| P7 | Knowledge | `AiSuggestionsPort` | `aiSuggestions` |

The three later ones are the same file with the words changed:

```ts
async xFor(userId: string): Promise<T> {
  const preferences = await this.profiles.preferencesFor(userId);
  return preferences?.x ?? (await this.settings.get('defaults.x'));
}
```

Including the fallback, which is the part that matters: a member mid-bootstrap
has no preferences row, and the honest answer is the installation default —
the very value the bootstrap is about to write.

## Why it is not simply a bug

Every one of those four is *correct*, and the constitution asks for exactly
this. Principle XII says a member knob is reached through the member's
preferences and never through the settings registry; principle IX says a
context declares the port it needs and binds it in its own `infrastructure/`.
Reading `SettingsService.get('defaults.aiSuggestions')` instead would be the
invisible bug this project has now declined to write four times: the two values
agree for every member who has not changed the setting, so the failure only
appears for the members who cared enough to change it.

The constitution also prices duplication deliberately — *duplicate over share,
move to `shared/` on the third copy* — and P6's adapter already argues why the
third copy did **not** move:

> what would move is not the logic (four lines) but a widened shared port, and
> that is the thing `MemberContextPort`'s own comment asks not to happen by
> default.

That argument still holds. `MemberContextPort` is narrow on purpose: it carries
the *scheduling-relevant slice three contexts need*, and its own note asks that
adding a field feel like a decision rather than a convenience, because every
field widens what several contexts can see of one.

So this is not four contexts doing something wrong. It is a rule whose cost has
become visible at the fourth repetition.

## What it costs

Little today and a little more each phase. Concretely:

- **A fifth is already scheduled.** P8's `mealMode` is a `user_preferences`
  field with a `defaults.mealMode` seed, and it will need the same adapter.
- **The fallback is the part that will drift.** Four copies of "or the
  installation default" is four places to get the bootstrap window right. Three
  of them are right today because each was written by reading the one before.
- **It is a trap for the phase that forgets.** The failure mode is not a broken
  build, it is a member whose setting is silently ignored — and a reviewer
  cannot see the absence of an adapter.

What it does *not* cost is correctness or coupling: the four ports point the
same way, and nothing in `domain/` or `features/` knows Profile exists.

## What fixing it takes

**A `MemberPreferencesPort` in `shared/`, exposing the whole preferences view,
with one adapter bound once.** A context asks for the field it wants and the
fallback lives in a single place.

The decision it forces, and the reason this is an enhancement rather than a
refactor somebody does quietly: it is a decision about **coupling**, not about
duplication. A shared port carrying the whole preferences document means five
contexts can see every field of it, where today each can see one. That is
exactly the widening `MemberContextPort`'s comment was written to prevent, and
it is a judgement about which risk is worse — a fifth copy of four lines, or a
wider surface that no future phase has to justify using.

Two shapes, if it is done:

1. **The whole view** — `MemberPreferencesPort.forMember(userId): Preferences`,
   with the registry fallback applied inside. Simplest, widest.
2. **A typed accessor** — `MemberPreferencesPort.get(userId, 'aiSuggestions')`,
   keyed by the field, so a context still names what it reads and a reviewer can
   see the surface each one uses. Narrower, and the type plumbing is real work.

**Recommendation:** the second, in P11's hardening — after P8 has added the
fifth copy and the shape of what is actually read is settled. Doing it now would
be designing the shared port against four known callers and one guessed one,
which is how a shared port ends up with a field nobody needed.

Until then the rule stands and is written down where it will be read:
`CLAUDE.md` already says *a member preference is never read from the settings
registry*, and each of the four adapters carries the argument in its own words.
