# 🤔 A4 — When do the clients move to GraphQL?

## ✍️ Your answer

```
ANSWER: migrate now

NOTES:
```

---

## Why this came up

The read edge now exists: nine queries at `/graphql`, published as
`packages/contracts/schema.graphql`. **Nothing calls it.** All four surfaces read
through the REST `GET`s they were built against, because those are what existed
when they were built.

Both edges are thin adapters over the *same* query handlers, so there is no
duplicated logic and no way for the two to disagree about an answer. What is
duplicated is the transport — and constitution X says reads are GraphQL, so two
read paths with one of them blessed is exactly the sort of thing that becomes
permanent by never being decided.

## The options

| Option | What happens | Cost |
|---|---|---|
| **migrate in P2** | P2 adds tasks, labels and reminders to every surface anyway. Their reads land on GraphQL from the start and P1's move with them — one pass over four clients instead of two | a day, inside a phase already touching those files |
| **migrate now** | A pass over the SDK, the portal, the extension and the phone before 016 starts, with nothing new to show for it | a day, and P1's gate has not run yet |
| **keep both** | REST reads stay supported. Constitution X gets an amendment saying so — an unmet principle is worse than an honest one | an hour, plus the amendment |

## What I would do

**Migrate in P2.** The reads that phase adds are most of what the phone actually
shows; doing P1's four queries alongside them costs almost nothing extra. Doing
it now costs the same day and moves nothing forward.
