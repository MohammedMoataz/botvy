# E-012 — Server-composed coach messages are English only

**Area**: product · **Status**: open · **Found**: P3, writing the three rhythm touches

## What

The daily rhythm writes three messages into the member's coach conversation
every day — the evening plan prompt, the end-of-day summary and the morning
briefing — and all three are composed on the server, in English, by
`contexts/rhythm/domain/touch-message.ts`. They are then **stored** as message
rows.

So a member using the app in Arabic reads an Arabic interface with three English
sentences a day in the middle of it. The interface strings are translated; the
coach is not.

## Why it is not simply a bug

Two reasons, and the first one is the honest one.

**Nothing asks for it.** `specs/017-daily-rhythm/spec.md` has thirteen
functional requirements and none of them mentions language. FR-005 asks that
every touch be written into the coach conversation; it does not say in what
language. A defect is a failure against a requirement, and there is no
requirement here to fail against.

**And it is not the same problem as translating the UI.** The phone's strings are
translated at *render* time, so a member who switches to Arabic sees the whole
app change. A message is composed once and stored, so it is stored in whichever
language composed it — a member who switches language keeps a month of English
coach messages, and messages are immutable, which is load-bearing for the sync
cursor and not something to give up for this. Whatever the fix is, it is not
"translate the string".

This is the same shape as [E-008](E-008-recurrence-text-is-english-only.md), and
worse in one way: a recurrence description sits beside a task the member wrote
themselves, where these three are the coach *talking*.

## What it costs

An Arabic-reading member gets an assistant that addresses them in a language
they did not choose, three times a day, in the feature whose whole purpose is to
feel like something that knows them. It is the most visible English in the
product for that member, and it is in the one place where the product is
supposed to have a voice.

It also quietly constrains P4. The coach's own replies come from a local model
with a prompt, and a prompt written to answer in the member's language beside
three touches that do not would read as two different assistants.

## What fixing it takes

Three options, cheapest first.

**Compose at render time instead of at write time.** Store the touch as
structured data — a kind plus its parts (`taskIds`, `training`, `mealLine`,
`autoConfirmed`) — and let each surface render the sentence from its own string
table, exactly as the recurrence text is rendered. The message row becomes a
small JSON payload rather than prose. This is the only option that follows a
member who changes language, and it is the one that fits the immutability rule
rather than fighting it. `MessageSchema` already carries an unused `intent`
field, and a sibling `composed` field would be the place. Cost: the phone, the
extension and the web all need a renderer, and the transcript for a member using
two surfaces has to render identically in both.

**Compose on the server in the member's locale.** `profiles.locale` is already
there, and `MemberSchedulePort` would carry it alongside the zone. One string
table per locale on the backend, `touch-message.ts` taking a locale parameter.
Cheap — perhaps a day — and it is what most products do. Cost: a second string
table to keep in step with the phone's, and a member who switches language keeps
their history in the old one.

**Let the model write them.** From P4 the coach already has a prompt and a
language; these three could be generated rather than templated. Most expensive
and least predictable — a generated summary can be wrong about what is in the
plan, where a template cannot — and it makes three notifications a day depend on
a model being up. Not recommended, recorded because it will be suggested.

**Recommendation:** the first option, taken in P4, when the message renderer on
each surface is being built anyway for the coach's own turns. Doing it then costs
almost nothing extra; doing it later means migrating stored prose.
