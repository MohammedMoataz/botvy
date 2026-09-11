# Decide: is it `v2.0.0` or `v1.2.1`?

You said either. They mean different things and only one of them is true, so
this is worth thirty seconds rather than a coin toss.

---

## What the version is claiming

Semantic versioning says the major number changes when the **contract** changes
in a way that breaks whoever depended on it. Here, the things that depend on it
are the phone app, the browser extension, and anyone restoring a backup.

| | v1 | v2 |
|---|---|---|
| API shape | `POST /chat`, REST everywhere | REST commands, GraphQL reads, a WebSocket for chat |
| Stores | PostgreSQL only | PostgreSQL for Identity, MongoDB for everything else |
| Sync entities | 2 | 9 |
| Phone database | v1's drift schema | schema version 9, a different ladder |
| Accounts | v1's rows | **none carried over** |
| Backups | one store | two stores and the media, one dated directory |

A v1 phone build pointed at v2 does not work — not "works with a warning",
does not work. A v1 backup cannot be restored into v2. A v1 account does not
exist.

**That is a major version.** `v1.2.1` would be a patch release: "we fixed a
couple of small things, your existing install keeps working." Every part of that
sentence is false here, and the version number is the first thing somebody reads
before deciding whether an upgrade is safe.

## My recommendation

**`v2.0.0`**, and it is not close.

The repository is public. Somebody who sees `v1.2.1` in the releases list will
reasonably assume they can pull it onto a running v1 install, and they will lose
their data finding out otherwise. The whole cost of getting this wrong is borne
by the person who trusted the number.

It is also what every artefact already says: `packages/contracts` publishes
`2.0.0`, the Swagger document is built with `.setVersion('2.0.0')`, and the P11
task list calls the publish step "`v2.0.0`" throughout. Tagging `v1.2.1` would
mean four artefacts disagreeing with their own tag.

## What you would be giving up

Nothing, as far as I can see. There is no reason to keep the major number low —
no dependency pins against it, no store listing that resets its reviews, no
customer contract keyed to a major version. If there is one I do not know about,
say so and I will work around it.

---

> **Your call:**
>
> ```
> [ ] v2.0.0  (recommended)
> [ ] v1.2.1
> [ ] something else:
>
> Reason, if not v2.0.0:
> ```

Whichever it is, all four artefacts carry the same number: both container
images, the Android app's `versionName` **and** `versionCode`, and the
extension's `manifest_version`. A release where the APK says one thing and the
tag says another is a release nobody can support.
