# 🔨 D6 — Google OAuth client ids

> ⏸️ **Skip this unless you answered [A1](decide-1-google-sign-in.md) with
> "configure it".**

## ☐ Answer

```
ANSWER: not doing this yet

ANDROID:
IOS:
WEB:
EXTENSION:
```

---

One client id per surface, because each has its own type:

| Surface | Client type in the Google Cloud console |
|---|---|
| Android | Android, with your signing certificate's SHA-1 |
| iOS | iOS |
| Web portal | Web application, with the portal's origin as a redirect URI |
| Extension | Chrome App, keyed to the extension id |

Then, in `.env.v2`:

```
GOOGLE_CLIENT_IDS=id1,id2,id3,id4
```

The server accepts a token addressed to any of them, and refuses one addressed
to something else — that audience check is enforced and tested.
