# The model

Everything about the language model Botvy runs on: where it lives, which models
it uses, and the prompts that are the product.

Nothing here is built or deployed. There is no `ai` container and no
`ai` package — this directory holds a **host-side dependency** (Ollama) and a
**set of text assets** (the prompts) that the backend image copies in. That is
deliberate and it is explained below.

```
ai/
  prompts/     the nine templates the backend fills in and sends
  ollama/      how to install and run the model server on the host
```

## Why Ollama is not in compose

It needs the GPU. Docker Desktop's Linux containers cannot see the host's
NVIDIA GPU the way a native Windows process can, and on Linux passing the GPU
through is a per-machine story. So Ollama is installed on the host, and the
backend reaches it at `OLLAMA_BASE_URL` (default
`http://host.docker.internal:11434`).

The consequence to remember: **`docker compose up` does not start the model.**
If `/health` reports `ollama false`, the server is not running or is bound to
loopback. `ollama/SETUP.md` is the fix.

## Which models

Not here. They are **registry keys**, because an operator retunes them without a
rebuild — constitution XII:

| Key | Default | Used for |
|---|---|---|
| `llm.chatModel` | `qwen2.5:3b-instruct` | the coach's and planner's answers |
| `llm.extractModel` | `qwen2.5:3b-instruct` | schema-constrained intent extraction |
| `llm.summarizeModel` | `qwen2.5:3b-instruct` | summarising a saved link |
| `llm.numCtx` | `8192` | **one** context size for every call |

Change them in the admin portal under Settings, or
`PATCH /api/v1/admin/settings/llm.chatModel`. The defaults are declared in
`backend/src/shared/settings/settings.registry.ts`.

Three things that have already cost time here:

- **One `numCtx` for everything.** Ollama keys a loaded model by its context
  size, so two sizes reload the model on every turn — measured at 39 seconds to
  first token.
- **`qwen3` is not a drop-in.** It is a thinking model: it emits a `thinking`
  field before its answer, which is exactly what schema-constrained output
  exists to prevent, and such a call does not return in reasonable time. A
  bigger extraction model means a bigger **instruct** model.
- **Residency beats size.** `/api/ps` must show `size_vram` equal to `size`. A
  4B that spills to the CPU is an order of magnitude slower than a 3B that fits.

## The prompts

`prompts/*.md`, nine files. They are text rather than string constants because
they are tuned by reading a bad answer and editing a paragraph, and a paragraph
inside a TypeScript template literal is a paragraph nobody edits.

| File | What it drives |
|---|---|
| `chat.md` | the shared system frame for every turn |
| `coach.md` | the coach conversation's voice |
| `planner.md` | the planner conversation, and its refusals |
| `intent.md` | the extraction grammar — the largest and the most load-bearing |
| `key-points.md` | pulling the points out of a saved document |
| `summarise-chunk.md` / `summarise-reduce.md` | the two halves of map-reduce summarisation |
| `session-suggestion.md` | drafting a training session from a saved document |
| `meal-suggestion.md` | the day's meal line |

`{{placeholders}}` are filled by `renderPrompt` in
`backend/src/shared/templates/prompt-files.ts`. A template that names a variable
the caller does not pass **throws** — a prompt shipped with a literal
`{{profile}}` in it is a prompt whose first instruction to the model is a
sentence about braces, and a 3B model answers it.

### How the backend finds them

The loader walks *up* from its own compiled location looking for `prompts/`,
then for `ai/prompts/`. From a source tree that finds `ai/prompts` at the
repository root; in the image it finds `/app/prompts`, because
`backend/Dockerfile` copies this directory in beside `dist`.

**That `cp` line is the only reason the image has them.** The prompts are no
longer inside the backend package, so `pnpm deploy` does not carry them. Delete
the line and every model call in the container throws on its first template read
while every test on a developer's machine passes.

### Changing one

Edit the file, restart the backend (templates are read once per process), and
run the checks that grade them:

```bash
pnpm --filter @botvy/backend test          # includes the corpus-leak assertion
pnpm --filter @botvy/backend build
node backend/test/intent-fixture.mjs       # forty sentences against the real model
```

`intent-fixture.mjs` is outside vitest on purpose: it needs a running Ollama and
it grades the **pipeline**, not the prompt — it imports the compiled
`relative-time` helpers, because measuring the model's unaided performance at the
one job those helpers exist to take away from it is measuring the wrong thing.

**Never put a corpus sentence in the prompt that grades it.** Sixteen examples
were once added to `intent.md`'s scope section and the score went 24 → 30; ten
were lifted from `intent-cases.json`, and the honest score was 29. There is a
spec assertion for this now (`chat-application.spec.ts`, "shares no example
sentence with intent-cases.json"), so it runs on every test pass.
