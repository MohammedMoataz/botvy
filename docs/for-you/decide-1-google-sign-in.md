# 🤔 A1 — Google sign-in: configure it, defer it, or drop it?

## ✍️ Your answer

```
ANSWER:  (configure it / defer to P9 / drop it)

NOTES:
```

---

## Where it stands

Everything behind it is built and tested: `POST /auth/google`,
`/auth/google/link`, the audience check, the three-case fork, the SDK's
`GoogleLinkRequired`, and the phone's `signInWithGoogle` / `linkGoogle`.

What does not exist is a **button on any of the three surfaces**, because
`GOOGLE_CLIENT_IDS` is empty on this installation — and a control that always
fails teaches people the app is broken. You asked me to skip the button, and I
did.

## The options

| Option | What happens |
|---|---|
| **configure it** | You supply the ids ([D6](do-6-google-oauth-ids.md)); I wire the buttons and the link form on all three surfaces |
| **defer to P9** | Stays as it is — endpoints live, no buttons. The extension phase is the natural home, since its flow is the fiddliest |
| **drop it** | I remove the endpoints and the `google-auth-library` dependency rather than leaving dead code behind |

## What I would do

**Defer to P9.** Nothing is broken today, and the extension phase has to solve
`chrome.identity.launchWebAuthFlow` anyway — doing all four surfaces at once is
cheaper than doing three now and one later.

Dropping it is also a real answer. There is no cost to removing it now beyond
re-writing it if you change your mind.
