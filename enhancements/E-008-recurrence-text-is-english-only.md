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
