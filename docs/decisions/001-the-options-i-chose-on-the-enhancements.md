# The options I chose on the enhancements

Every file in `enhancements/` that offered more than one route, the route taken,
and what to say if you want the other one. Where the file itself named a
recommendation, it was followed unless the reason it gave has since expired —
and the three places it had are called out as such, because a recommendation
overridden silently is the thing this directory exists to prevent.

## Followed the file's own recommendation

| # | Route taken | Rejected |
|---|---|---|
| E-002 | Fix the two `\| Out-Null` lines and hold the drift from spec-kit's generated scripts | Leaving a script whose text mode prints nothing |
| E-004 | Generate the cross-context lint group from the directory listing, checked in CI | Splitting the rule by depth — shorter, and a wildcard that forbids a legal import is worse than twelve honest patterns |
| E-005 | Keep the relay's dispatch table and assert at boot that every declared subscription has a case | A decorator-discovered bus: "who handles this event" stops being answerable by reading one file |
| E-009 | `gen:contracts` refuses a stale `dist/` | `pnpm build &&` in front of it, which makes the contracts command depend on a Prisma toolchain being installed |
| E-011 | The view rules move to a pure module every surface imports | Making the SDK store reads async and threading that through the portal |
| E-013 | Leave it, and say so where the number is shown | A character-count estimate, which is wrong by a factor that varies with the language |
| E-014 | Make the SDK's parser boundary loud | Extracting a shared expander package, which is only worth it once something writes a rule the subset cannot read |
| E-016 | An edit onto a tombstone is refused as `invalid` with a code | A new `deleted` verdict — right, and it wants the phone's rejection handling open in front of it |
| E-017 | The proper fix: `at` sets the domain fact, `updatedAt` is always the server's now | Clamping forward per aggregate, which leaves the conflation in place for the next reader |
| E-018 | The job declares its cadence when it stamps | Exporting the cadence beside each job's name constant, which points the health module at four contexts |
| E-019 | `bootstrapped` on the auth responses | A retry inside a query handler, and on-demand row creation — two seeders for one document |
| E-020 | A typed accessor keyed by field | The whole preferences view behind one port, which lets five contexts see every field |
| E-025 | The policy on the edge, nonce from the middleware, **enforced** once nine pages had been watched in a real browser | Deleting `contentSecurityPolicy: false` from the API, which breaks the playground and covers no page |

## Where I overrode the file, and why

**E-003 — hand-edit the seven skills rather than regenerate them.** The file
prefers flipping `"script"` in `.specify/init-options.json` and re-running
spec-kit's own generation. That needs spec-kit's generator run against this
repository, which is not something to do unattended to files whose hashes are
tracked — and the file itself notes the likely result is bash-only skills, which
trades Windows for Linux rather than fixing anything. The seven skills select by
OS instead, and the drift is written into each file so a future `specify` run
that overwrites it is understood rather than mysterious.

**E-012 — compose the touches on the server in the member's locale.** The file
recommends storing the touch as structured data and rendering it on each
surface, taken "in P4, when the message renderer on each surface is being built
anyway". P4 shipped without it, so that discount is gone: taking option one now
means a renderer in the phone, the extension and the web, a change to the stored
message shape, and a migration of prose already in members' transcripts —
against three English sentences a day. Option two is a string table on the
server keyed by `profiles.locale`, and it is the option the file prices at about
a day. The cost it names is real and unchanged: a member who switches language
keeps their old history in the old one. Messages are immutable and that is
load-bearing, so no option avoids that except rendering at read time, which is
the expensive one.
**If you would rather have option one**, say so — it is a phase of work, not an
afternoon, and it wants the three renderers designed together.

**E-001 — format the code, not the prose.** The file says one commit that runs
`prettier --write .` over the whole tree. Markdown is excluded instead: the
specs, the enhancement files and `CLAUDE.md` are hand-wrapped records of
decisions, several of them historical, and reformatting a document nobody is
editing adds churn to `git blame` for no review benefit — which is the exact
cost the file is trying to remove. The reason is written into `.prettierignore`
beside the rule. Everything the file actually complains about — 143 files of
drifting TypeScript — is formatted, and `format:check` runs in CI.

## Where a recommendation was already spent

**E-006 — the version counter.** The file's own recommendation is "worth doing
once, before a context arrives whose aggregate several handlers write
concurrently". That is the change taken: an integer on every aggregate,
incremented on save, with the filter matching the version the copy was loaded
at. The `$lte` timestamp comparison stays as the fallback for a row written
before the column existed, which is what makes it a change with no migration.

**E-007 — nulls last in the by-label view.** The aggregation route, not the
stored `hasDueDate` boolean: it keeps the derived value derived. The file calls
the ordering "a design question rather than a technical one" — the design answer
taken here is that a task with a deadline sorts above one without, within each
status. Say so if you want "some day" tasks at the top instead; it is one
comparator and its Mongo half.

**E-008 — the server stops sending prose.** The phone already renders the rule
from the structured fields in the member's own language, with Arabic number
agreement done properly. The server's `recurrenceText` was the last English
sentence in that path, and the two surfaces still reading it — the admin portal
and the chat's confirmation — now render from the same structured rule.

**E-010, E-015.** E-010 was closed in P5 and is marked `done`. E-015 is a pass of
about forty strings through `AppLocalizations`, which is mechanical and was
waiting for somebody to have those screens open; that is now.

## What none of this changes

Nothing here touched the credential rotation, the restore rehearsal, the deploy
or the soak — see [002](002-what-p11-still-needs-a-machine-or-you-for.md). And
no enhancement was closed by writing "declined" on it: every file's status now
reflects code in the tree, or says what it is still waiting for.
