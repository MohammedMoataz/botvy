# Feature Specification: A chat turn reuses what the model already read

**Feature Branch**: `031-chat-latency`

**Created**: 2026-10-08

**Status**: In progress (follows 030; not a blueprint phase)

**Input**: the Owner, 2026-10-08 — "the model is very slow when I chat with the
coach chat or the planner one, or create a new one."

## Why this feature exists

The model is not slow at writing. On the Owner's GPU (GTX 1050, 4 GB) it writes
at about 23 tokens a second, which is fast enough to read along with. It is slow
at **reading the prompt**: about 115 tokens a second. Ollama has a cache for
that: if the start of a request is the same as the start of a request it has
already read, it skips that part. Every chat turn was built so that the cache
almost never matched.

Measured on 2026-10-08 against the live Ollama, from inside the backend
container, using the real templates:

| Call | Prompt tokens | Prompt read | Wall |
|---|---|---|---|
| Model load after a reboot | — | — | 10.2 s |
| Intent extraction, not cached | 3,684 | 31.3 s | 33.2 s |
| Intent extraction, cached | 3,680 | 0.5–1.3 s | 1.6–2.9 s |
| Coach turn, 20 history messages, minute changed | 1,864 | **12.2 s** | 16.6 s |
| The same turn in the same minute | 1,863 | **0.2 s** | 4.9 s |

Five causes, in the order they cost the member time:

1. **The clock is in the system prompt.** `coach.md`, `planner.md` and
   `chat.md` render `{{now}}` (hours and minutes) above the day block and the
   whole transcript. The cache matches only up to the first token that differs,
   so whenever the minute has changed since the last turn — which is nearly
   always — the whole history is read again. The cost grows with the
   conversation.
2. **The history window slides one message per turn.** `slice(-limit)` drops
   the oldest message each time a chat is longer than `chat.historyLimit`, so
   everything after the system prompt shifts and nothing matches, even within
   the same minute.
3. **Nothing loads the model after a restart.** `OLLAMA_KEEP_ALIVE=-1` keeps a
   model loaded once something has loaded it, and after a reboot nothing has.
   The first turn paid the 10 s load plus 31 s to read the 13 KB `intent.md`.
   A host without the variable unloads after five minutes idle and pays it
   again.
4. **The answer has no length ceiling.** A 290-token coach answer takes 12 s to
   write.
5. **Store round trips run one after another.** Atlas is about 65 ms away, and
   a turn makes 20–30 sequential reads and writes.

Ollama's chat template for `qwen2.5` collects **every** `system` message into a
single block at the top of the prompt (`ollama show --template`). So "move the
clock into a second system message near the end" does not work: Ollama would
put it back at the top. The volatile part has to travel in the member's latest
message.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A reply in a long coach or planner chat starts in seconds (Priority: P1)

A member in a coach chat with dozens of messages sends another one. The first
word of the answer appears within a few seconds, not after ten or more, and
this does not depend on whether a minute has passed or how long the chat is.

**Acceptance**:
1. Two turns built a minute apart for the same chat have byte-identical system
   prompts and byte-identical history. Only the last message differs.
2. As a chat grows past `chat.historyLimit`, the first message of the window
   stays the same for about half the limit before it moves.
3. The latest message carries the date, the local time and the day block, in
   a `<now>` block written by Botvy. A member who types `<now>` cannot open or
   close that block.

### User Story 2 — The first chat after a restart is not the slowest one (Priority: P1)

The Owner reboots the machine, the stack comes up, and the first message
anybody sends is answered as fast as the tenth.

**Acceptance**:
1. Once Ollama answers, the API loads the extraction model by itself and has
   it read the fixed part of `intent.md`. It checks again every minute and
   loads the model again if Ollama dropped it.
2. Every call to Ollama sends `keep_alive` from the `llm.keepAlive` setting, so
   keeping the model loaded no longer depends on an environment variable on
   the host.
3. The worker and contract generation load nothing.

### User Story 3 — An answer has a ceiling (Priority: P2)

A chat answer stops at `llm.chatMaxTokens` tokens (default 512), which is an
operator setting. The prompts already ask for short answers; the ceiling is
the backstop for the times the model ignores them.

### User Story 4 — The turn does not wait on the stores one read at a time (Priority: P3)

Reads that do not depend on each other run in parallel: the conversation and
the member's facts in `TurnRunner`, and the day block and the history in
`PromptAssembler`.

## Requirements

- **FR-001** No template a chat turn renders as its system prompt may contain a
  value that changes within a day for reasons other than the member's own
  profile. `{{now}}`, `{{today}}`, `{{timezone}}` and `{{day}}` move to the
  final user message.
- **FR-002** The history window's start index moves in steps of
  `max(1, floor(limit / 2))`, never by one per turn. The window never holds
  more than `limit` messages.
- **FR-003** `delimitQuoted` neutralises forged `<now>` markers the same way it
  neutralises forged `<quoted>` markers.
- **FR-004** The API process (role `backend`, not generation mode) warms the
  extraction model at boot and again every 60 s whenever `/api/ps` does not
  list it as loaded. Failures are logged at debug level and never block boot.
- **FR-005** `llm.keepAlive` (seconds; `-1` means keep the model loaded
  forever; default `-1`) is sent as `keep_alive` on every request
  `OllamaClient` makes.
- **FR-006** `llm.chatMaxTokens` (default 512) is sent as `num_predict` on the
  chat turn's streamed call.
- **FR-007** Host guidance (`ai/ollama/SETUP.md`) states what the prompt
  cache needs from Ollama, and what the Owner's GPU measured.

## Success criteria

- **SC-001** The 20-message coach turn that measured 12.2 s of prompt reading
  measures under 1 s on the second turn, a minute later.
- **SC-002** After restarting the backend container with Ollama freshly
  restarted, the first extraction reads less than 2 s of prompt.
- **SC-003** `pnpm typecheck`, `pnpm lint` and `pnpm vitest` are green.

## Out of scope

- A faster GPU or a smaller model. Writing speed stays at about 23 tokens a
  second on this hardware.
- `HISTORY_SCAN_CAP`'s oldest-500 read (`prompt-assembler.ts`). It is correct
  below 500 messages since the last clear, and its own `ponytail:` note names
  the real fix.
- Shortening `intent.md`. Once it is warm it costs 0.5 s, and changing it moves
  the intent score, which has its own fixture.
