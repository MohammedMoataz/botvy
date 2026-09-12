# Do: delete the old Firebase key — the half that actually closes it

This is [`I21`](inputs-016-to-025.md#i21--rotate-the-firebase-key-for-real),
pulled out on its own because it is the **one mandatory blocker for the
release** and it is five minutes of work.

---

## Where it stands

You rotated it on 10 September. `secrets/firebase-admin.json` carries key id
ending `424ead`, and that is the live credential the backend uses.

**The old key ending `c3a2a5` has not been deleted.** Adding a key does not
revoke anything — a service-account key stays valid until it is *deleted* in the
console. So until that happens, the key that was committed to the public v1
repository still works for anybody who ever cloned it.

## What is left

1. Google Cloud console → IAM & Admin → Service Accounts → the Botvy account →
   **Keys**.
2. Find the key ending **`c3a2a5`**. Confirm it is not the one ending `424ead`.
3. **Delete it.**
4. Send yourself a test notification from the portal, to prove the live key
   still works afterwards.

While you are on that page, look at the account's **roles**. If it holds more
than Firebase Cloud Messaging needs, narrow it — a key that leaks again should
be able to do less than this one could.

---

> **Fill this in and I will close it out:**
>
> ```
> Old key c3a2a5 deleted:   [ ] yes      on:
> Push still works after:   [ ] yes
> Roles narrowed:           [ ] yes   [ ] not needed
> ```
>
> Then I delete the deferred-rotation section from `SETUP.md` and its contents
> entry, update `secrets/README.md`, close §11 of `docs/security-review.md`, and
> tick `T1113` — and this file and `I21` both go.

Until then §11 of the security review stays open and says plainly that the key
is live. A document that calls a live key compromised is worse than one that
never raised it, which is why it does not close early.
