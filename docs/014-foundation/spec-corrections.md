# Where the specification was wrong

Foundation phase (P0), `specs/014-foundation`.

Places the phase spec said something the code could not honour, and what I changed instead. Recorded because the next phase reads those specs and would inherit the same mistake.

---

Two places where implementing the phase proved the spec wrong. Both are
committed:

1. **`014-foundation/data-model.md` §7** still listed `ALLOW_REGISTRATION` as an
   environment variable after the remediation pass had made it the
   `auth.registrationOpen` registry key. Building it as written would have
   contradicted P1.
2. **`packages/tokens`** exported a path (`./tokens.css`) that neither web
   surface imported (`./dist/tokens.css`), which would have failed both builds.
   Widened the exports map rather than rewriting two consumers.

---
