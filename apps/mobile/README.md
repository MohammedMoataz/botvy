# Botvy mobile

Flutter + Riverpod 2 + drift (SQLite). Android is the only platform actually
built; the `web/` folder is scaffolding and will not run — drift, local
notifications and Firebase messaging all need the native side.

Start here: [`../../SETUP.md`](../../SETUP.md), and
[`../../specs/`](../../specs/) for the reasoning behind each part.

## The idea

The phone holds the user's whole account — chats and their messages, reminders,
coaching settings, check-ins and past programs — in its own SQLite database, and
reconciles with the gateway through one `POST /sync`. Everything the app can do,
it can do with no connection; the server is the shared merge point rather than
the place the data lives.

Alarms are scheduled locally from that database, which is why a reminder fires
with no network, no server and no Google reachability.

## Things that will bite you

- **The local schema has migrations too.** Any change to
  `lib/src/db/database.dart` needs a `schemaVersion` bump *and* a matching
  branch in the `MigrationStrategy` in the same file. Drift's default
  `onUpgrade` throws, so the failure mode is every existing install refusing to
  open. `test/migration_test.dart` and `test/migration_v3_test.dart` build
  old-shaped databases and assert nothing is lost — add a case rather than
  trusting the change.
- **`pending_op != 'x'` is NULL for a clean row, and NULL is falsy.** Write
  "not this pending operation" as `pendingOp.isNull() | pendingOp.equals(x).not()`
  or the filter hides every row.
- **Two timestamps mean two things.** `updatedAt` is when this device edited a
  row; `baseUpdatedAt` is the server's own value for the version last pulled,
  and a local edit must never touch it.
- Run `dart run build_runner build --delete-conflicting-outputs` after touching
  the database; the generated files are committed.

## Which gateway it talks to

The URL is **not** compiled in. The app reads it from secure storage and only
falls back to `kDefaultBaseUrl` on a fresh install, so a user can point the app
anywhere from Settings without a new build.

That fallback is injected at build time, which is how a release carries whatever
the tunnel is actually serving:

```powershell
node ..\..\infra\build-mobile.mjs                        # ask the running tunnel
node ..\..\infra\build-mobile.mjs https://botvy.example  # or say it outright
node ..\..\infra\build-mobile.mjs --check                # print it, build nothing
```

It validates the URL, runs `test/base_url_test.dart` with the same value the
APK is about to carry, then builds. Underneath it is just
`--dart-define=BOTVY_BASE_URL=...`.

A quick-tunnel hostname changes whenever that container restarts, so baking one
in only makes sense for a named tunnel — the script warns when you do it anyway.

## Working on it

```powershell
flutter analyze
flutter test
flutter build apk --release
```

Tests use a real in-memory drift database and subclass fakes
(`class _FakeApi extends ApiClient`) rather than a mocking package. There are no
widget tests.
