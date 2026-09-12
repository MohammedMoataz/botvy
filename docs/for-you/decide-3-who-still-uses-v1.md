# Decide: who still uses v1, and what they are told

`T1121` is the one task in the phase that is entirely a people problem. I cannot
do any of it, and it has to happen **before** the reset deletes v1's volumes —
or at least before you stop being able to start v1 again.

---

## What I need from you

The archive step of `infra/reset.mjs` writes `v1-members.csv` with every account
v1 holds, its role and its status. Open it and fill this in:

```
Members still using v1 (other than me):

  1.
  2.
  3.

Members v1 had banned:

  1.
  2.

Anyone I do not recognise:

```

## What each column means for the work

**Active members other than you.** They need telling that the old system is
going away, that their reminders and chats do not carry over, and where the new
app is. Nothing migrates — that was settled when you chose a clean start — so
their history ends with v1 and the archive is the only copy.

**Banned members.** This is the one with a rule attached. `docs/parity.md` owes
a check that each of them is still refused by v2, and v2 started from an empty
database, so none of them is banned there yet — they simply have no account.
That is *sufficient*, but it has to be confirmed rather than assumed: an account
that does not exist and an account that is banned both refuse a sign-in, and the
difference matters the day one of them registers.

So for each banned member I need to either create the account in v2 and ban it,
or record that registration is closed so they cannot create one. Tell me which
you want:

```
[ ] Registration stays closed — nobody new can sign up, so a banned member
    cannot come back. Simplest, and it is the current setting.
[ ] Registration is open — then each banned member needs an account in v2,
    banned, so their address is taken and refused.
[ ] There were no banned members. Nothing to do.
```

**Anyone you do not recognise.** Worth a look before the volumes go. An account
you cannot account for on a system that was tunnelled to the internet is the
sort of thing that is much easier to investigate while the database still
exists.

---

## If the answer is "nobody but me"

Say so and this collapses to one line in `docs/parity.md`, and `T1121` closes
with the CSV as its evidence. That is a perfectly good outcome — it just has to
be written down rather than assumed, because "there was nobody else" and "I
never checked" look identical afterwards.
