# E-013 — An aborted or blocked turn's tokens are never metered

**Area**: product · **Status**: open · **Found**: P4, writing the turn's specs

## What

`chat.dailyQuotaTokens` is enforced from `usage_log`, which is written from
`conversations.MessageSent`, which carries the counts Ollama reports. Ollama
reports them **only in the `done` frame** of a stream.

Two paths never reach that frame:

- **The member presses Stop.** `chat.cancel` aborts the signal, the generator
  throws, and the partial answer is stored with `usage: null`.
- **The allergen guard fires.** The stream is returned early, the partial is
  discarded, and the apology is stored — also with `usage: null`.

So a turn that generated four hundred tokens before being stopped counts as
zero against the member's allowance. A member who habitually stops long answers
consumes GPU time indefinitely and never approaches their limit.

## Why it is not simply a bug

Because **the number does not exist to record.** The local model's API returns
`prompt_eval_count` and `eval_count` in the terminating frame and nowhere else;
an aborted HTTP stream has no terminating frame. There is nothing to write, so
this is a limitation of the interface rather than a mistake in the code that
uses it.

And the obvious workarounds are worse than the gap:

- **Counting characters and dividing.** A tokeniser-free estimate is wrong by a
  factor that varies with the language — Arabic runs at far more tokens per
  character than English — so an Arabic-writing member would be metered at
  several times their real usage. A limit that is wrong per language is worse
  than a limit that is occasionally under-counted.
- **Counting the prompt only.** The prompt's token count is also only in the
  `done` frame, so this recovers nothing.
- **Billing a flat estimate per aborted turn.** Arbitrary, and it would meter a
  member who stopped an answer after one word the same as one who stopped after
  five hundred.

## What it costs

Less than it looks, because the *other* limit still applies.
`chat.ratePerMin` counts `chat.send` calls, not tokens, so an aborted turn is
counted there in full — a member cannot loop faster than the operator's
per-minute limit however often they stop. The uncounted work is bounded by that
rate, not unbounded.

What is genuinely lost is accuracy: the admin's usage figure in P10 will read
low by however much stopped generation cost, and a member near their limit gets
slightly more headroom than the number says. Neither is a safety problem on a
single-host deployment where the GPU is the member's own.

The allergen path is rarer still — it fires only when an answer names a
declared allergen, which SC-003 measures at zero across the corpus.

## What fixing it takes

Three options, and the first is the only one worth doing.

**Ask Ollama for the counts it has.** `/api/generate` and `/api/chat` both
accept `keep_alive` and report on completion; there is no documented way to
interrogate a stream that was cut. If a future version exposes per-chunk
counts, or a `usage` field on an aborted response, the fix is one field in
`OllamaClient.chat`'s abort path and one line in `TurnRunner.converse`. Worth
re-checking at each Ollama upgrade — the client already pins a version in
`plan.md`'s dependency table, so the check has a natural home.

**Meter with a real tokeniser.** Load the model's own tokeniser
(`tiktoken`-style) and count the partial locally. Accurate, and it adds a
dependency, a model-specific asset to keep in step with `llm.chatModel`, and a
second place that can disagree with the server about what a token is.

**Charge the rate limit instead.** Convert `chat.ratePerMin` into the primary
protection and treat the token allowance as advisory. Honest about what is
measurable, and it gives up the thing an operator actually wants to cap.

**Recommendation:** leave it, and re-test on the next Ollama bump. Record the
gap in P10's usage screen — a footnote saying stopped answers are not counted
is cheaper than a wrong number presented as exact.
