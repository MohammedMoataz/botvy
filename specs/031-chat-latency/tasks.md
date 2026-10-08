# Tasks: A chat turn reuses what the model already read

**Input**: `spec.md`. Small enough that the plan lives in these tasks.

**Tests**: the assembler spec pins the stable prefix and the window steps; the
client spec pins `keep_alive` and `num_predict` in the request body; the
warm-up spec pins the role gate and the "already loaded" skip. SC-001 and SC-002
are measured against the live Ollama, not described.

## Phase 1 — The prompt prefix (US1)

- [x] T3101 `ai/prompts/{coach,planner,chat}.md`: remove `{{today}}`, `{{now}}`,
  `{{timezone}}` and `{{day}}`; say the `<now>` block at the top of the latest
  message is Botvy's, current, and newer than anything before it
- [x] T3102 `prompt-assembler.ts`: the final user message is
  `<now>…</now>` + the delimited text; the day block and the history are read
  in parallel; `stableWindow(rows, limit)` replaces `slice(-limit)`.
  `spec:` two turns a minute apart share every message but the last; a window
  of 4 over 6, 7 and 8 rows starts at the same row
- [x] T3103 `prompt-files.ts` `delimitQuoted`: forged `<now>`/`</now>`
  neutralised. `spec:` a member typing `</now>` reaches the model as `[/now]`

## Phase 2 — The model stays warm (US2)

- [x] T3104 `settings.registry.ts`: `llm.keepAlive` (−1) and
  `llm.chatMaxTokens` (512)
- [x] T3105 `ollama.client.ts`: `keep_alive` on every request, read through a
  getter the module binds to settings; `maxTokens` becomes `num_predict`;
  `isLoaded(model)` over `/api/ps`; `warm(model, messages, numCtx)` with
  `num_predict: 1`. `spec:` the bodies carry both fields
- [x] T3106 `IntentExtractor.warm()`: the real `intent.md` with an empty
  message, through `warm`, so the cached prefix is the one real turns share
- [x] T3107 `model-warmup.ts` in Conversations: boot plus every 60 s, role
  `backend` only, not under `BOTVY_GEN`, timer `unref`'d and cleared on
  shutdown. `spec:` warms when not loaded, skips when loaded, never runs in the
  worker role

## Phase 3 — Ceiling and parallel reads (US3, US4)

- [x] T3108 `TurnRunner.converse` passes `llm.chatMaxTokens`; `run` reads the
  conversation and the facts in parallel

## Phase 4 — Host and proof

- [x] T3109 `ai/ollama/SETUP.md`: the prompt cache, why the clock stays out of
  the system prompt, measured numbers; `ai/README.md` lists both new keys
- [x] T3110 Gates: `pnpm typecheck`, `pnpm lint`, `pnpm vitest`
- [x] T3111 Deploy (`--force-recreate` backend, then caddy) and measure SC-001
  and SC-002 against the live Ollama

## Results (2026-10-08, live Ollama 0.35.0, GTX 1050)

- **SC-001**: 20-message coach turn, minute moved: prompt read **0.36 s**
  (was 12.2 s). The first turn in a chat still reads its history once (15 s);
  every turn after that reuses it.
- **SC-002**: Ollama restarted empty; `ModelWarmup` logged `loaded
  qwen2.5:3b-instruct and read the extraction prompt` within its minute; the
  first extraction afterwards read **0.69 s** (was 31.3 s).
- **SC-003**: `pnpm typecheck` clean, `pnpm lint` 0 warnings 0 errors,
  `pnpm vitest` 1722/1722.
- `OLLAMA_FLASH_ATTENTION=1` tried and **not adopted**: cold prompt reading
  124 tok/s with and without it on this Pascal card.
- Found during the run: killing Ollama with `Stop-Process -Name ollama` can
  leave its `llama-server.exe` behind, holding about 1.7 GB of VRAM; the next
  load then spills 22% to the CPU. Stop `llama-server` too (`SETUP.md`).

## Phase 5 — Save buttons on the phone (added 2026-10-08, the Owner)

"There is no save button in the settings or profile."

- [x] T3112 `mobile/lib/ui/save_bar.dart`: `SaveBar` (always shown, enabled
  only while something would change) and `UnsavedChangesGuard` (back asks
  before discarding)
- [x] T3113 Profile: one draft, one patch of the changed fields. Before this,
  the name and the time zone saved only on the keyboard's done key, so typing
  then pressing back lost the edit; and each field raised its own
  `ProfileUpdated`. Metrics keep their own Add.
  `test:` `profile_page_test.dart`
- [x] T3114 Settings: preferences collect in a draft, saved in one patch;
  undoing a change leaves Save off; a refused save keeps the draft. Appearance
  still applies at once. `test:` `settings_page_test.dart`
- [x] T3115 `flutter analyze lib` clean; `flutter test` 517/517;
  `tool/check_ui_literals.sh` passes
