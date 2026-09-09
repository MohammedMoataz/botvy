# 📖 R4 — Where the specs said something the code could not honour

## ☐ Read?

```
READ:  (yes)
```

---

Recorded because the next phase reads those specs, and an uncorrected mistake
gets inherited. All of these are already corrected in the spec files themselves.

The permanent records are
[`../014-foundation/spec-corrections.md`](../014-foundation/spec-corrections.md)
and
[`../015-identity-profile/spec-corrections.md`](../015-identity-profile/spec-corrections.md).

## P0

1. **`ALLOW_REGISTRATION` as an environment variable.** `data-model.md` §7 still
   listed it after a remediation pass had made it the `auth.registrationOpen`
   registry key. Building it as written would have contradicted P1 — and a
   hard-coded default is what principle XII exists to prevent.
2. **`packages/tokens` exported a path nothing imported.** `./tokens.css` where
   both web surfaces import `./dist/tokens.css`. Would have failed both builds.

## P1

1. **T127, importing v1 profiles, is obsolete.** You chose a clean start, so v2
   runs on its own volumes and cannot see v1's PostgreSQL at all. Every member
   registers again and `bootstrap-on-registered` gives them the registry
   defaults — which the task itself described as the fallback. Marked `[~]`,
   retired rather than delivered.
2. **T111 and T114 were partly built in P0.** Sign-in and password change landed
   in the foundation phase, because the administrator seed had been warning on
   every boot that you should change the default password at an endpoint that
   did not exist. P1 extended them rather than rebuilding.
3. **T102's Google verifier.** The task named a library and an approach; the
   detail differs. See the file.

## P0's task list, on the two capabilities it claimed

Worth stating plainly, because it is the one pattern I would want checked in
every future phase: **T025, T026, T031 and T117 were all marked done, and none
of them was built.** The tasks are corrected now and say what actually
happened — including that they were built in the review pass rather than in the
phase that claimed them.
