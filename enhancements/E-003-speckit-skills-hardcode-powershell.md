# E-003 — The speckit skills hard-code the PowerShell path

**Area**: tooling · **Status**: open · **Found**: P2, while adding the bash halves

## What

Seven `.claude/skills/speckit-*/SKILL.md` files invoke the scripts by path:

```
.specify/scripts/powershell/check-prerequisites.ps1
```

No `{SCRIPT}` placeholder, no OS switch. The bash equivalents now exist at
`.specify/scripts/bash/*.sh` with identical `--json` contracts, and nothing
points at them.

## Why it is not a defect

On this machine it works, and this machine is where the phases are being built.

## What it costs

**The spec-kit slash-commands do not work on Linux**, which is the deployment
target and the CI platform. Anyone cloning this repository on Linux can build,
test and run the stack, but not drive the spec-kit workflow.

## What fixing it takes

Not a text edit, or not only. The seven files are *generated* from
`"script": "ps"` in `.specify/init-options.json` plus `.specify/integration.json`,
and their hashes are recorded in `.specify/integrations/claude.manifest.json`.
Two honest routes:

1. **Flip the setting and regenerate.** Change `"script"` and re-run spec-kit's
   own generation so the manifest matches. Cleanest, and it is spec-kit's
   intended path — but it likely produces bash-only skills rather than skills
   that choose, trading one platform for the other.
2. **Hand-edit the seven lines and accept manifest drift.** Works immediately on
   both platforms if the edit selects by OS, at the cost of a checksum mismatch
   a future `specify` run may overwrite.

Route 1 is probably right, with a note in `SETUP.md` saying which platform the
skills are generated for. Worth first checking whether spec-kit has since grown
a both-platforms option.
