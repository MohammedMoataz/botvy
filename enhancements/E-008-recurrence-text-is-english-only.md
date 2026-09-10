# E-008 — `recurrenceText` is English only

**Area**: product · **Status**: open · **Found**: P2, building the recurrence wrapper

## What

`TaskView.recurrenceText` renders a repeat rule as words — "every 2 weeks on
Tuesday" — via `rrule`'s own `toText()`, which is English unless handed a gettext
table per language. The server sends English regardless of the member's locale.

## Why it is this way

`rrule`'s localisation wants a translation function and a language object per
language, and Arabic is not among the ones it ships. Writing that table is real
work with real linguistic judgment in it: Arabic pluralisation and the names of
the days are not something to guess at.

The phone also already holds its own strings for its locale and can render the
rule from the structured fields, which are all on the row. So the server's text
is a convenience for the admin portal and for chat confirmations, not the
member's primary path.

## What it costs

Two surfaces show it to a member: the coach's confirmation line when a repeating
task is created from chat, and the admin portal. An Arabic-reading member who
sets up a weekly task through the chat gets "every Tuesday" read back to them,
which is a small but real break in an interface that is otherwise theirs.

## What fixing it takes

Either:

- **Render it client-side everywhere.** The structured rule is already on the
  wire, so the phone and the web app each render in their own locale. The server
  then stops sending prose at all, which is the cleaner boundary — a server
  should not be writing sentences in somebody else's language.
- **Supply `rrule` with an Arabic language table.** One implementation, needs a
  native speaker's eye on the plurals, and still leaves the server guessing the
  locale.

The first is better, and is roughly where P4's own Arabic work will land anyway.
Worth deciding then rather than building a translation table now.

## P5: the phone half is built, which is the resolution this file proposed

This file's own argument was that the phone holds its own strings and can render
the rule from the structured fields, which are all on the row — so the server's
English text is a convenience for the admin portal and for chat confirmations
rather than the thing a member reads.

P5 built that. `apps/mobile/lib/core/recurrence/rule_words.dart` turns a
`RepeatSpec` into words in the member's own language, from the structured fields
and not from `rrule`'s `toText()`, and the repeat picker reads it. The hard part
was the part this file said it would be: Arabic number agreement is not
pluralisation with an `s`. "Every 2 weeks" is **كل أسبوعين** — a dual form, not
"2" plus a plural — 3 to 10 take the plural of the counted noun, 11 and above
take the singular after the number, and the list separator is ، rather than a
comma. Guessing any of those produces text that reads as broken to a native
speaker, which is worse than English.

**This file stays open**, narrowed to what it actually still covers: the
*server's* `TaskView.recurrenceText`, which still comes from `rrule.toText()` in
English and reaches the admin portal and the chat's confirmations. Two things
would close it — a gettext table for `rrule` (real linguistic work, in a library
that does not ship Arabic), or having the server stop sending prose at all and
send only the structured rule, leaving every surface to render it the way the
phone now does. The second is cheaper and is the direction the phone has just
demonstrated; it is a change to a published read shape, so it belongs in a phase
that is touching those reads anyway rather than here.
