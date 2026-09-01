# Tasks: Readable Replies, Web Search, Inline Images

**Spec**: [spec.md](./spec.md) · **Status**: Implemented

## Model and latency

- [x] **T001** `OLLAMA_CHAT_MODEL=qwen2.5:3b-instruct`, fully VRAM-resident.
      *Evidence*: `/api/ps` → `size 2.16GB, size_vram 2.16GB`.
- [x] **T002** Send `think` only when `OLLAMA_THINKING` says the model reasons.
      *Evidence*: `think:true` on qwen2.5 → `"does not support thinking"`.
- [x] **T003** One `OLLAMA_NUM_CTX` for extraction and chat alike.
      *Evidence*: two sizes → 39s to first token; one → 2.8s.
- [x] **T004** Require only `intent` in the classifier grammar; recover the
      reminder fields with a second, narrower grammar when they are missing.
      *Evidence*: 48 tokens/3.3s → 19 tokens/1.5s per turn.

## Time handling

- [x] **T005** `wallClockToUtc`: the model writes the user's clock, code
      converts, DST included. 8 tests.
- [x] **T006** `resolveRelativePhrase`: "in two hours" and "بعد ساعتين" parsed
      in code, in both languages and both digit sets.
- [x] **T007** `preferSoonestDay`: a bare "at 9pm" said at six means tonight.
      Scoped to the next-day slip only, so a named day is never moved.

## Rendering

- [x] **T008** `flutter_markdown_plus` for assistant bubbles; user bubbles stay
      literal; one `SelectionArea` around the conversation.
- [x] **T009** Links open externally, http(s) only.
- [x] **T010** Widget tests: heading, list and link render as widgets; a
      half-arrived reply does not throw; a user's asterisks survive.

## Search

- [x] **T011** SearXNG service, no published port, JSON format enabled,
      limiter off, engines restricted.
- [x] **T012** `SearchService`: 5 snippets, markup stripped, 300 chars, typed
      failure. 11 tests.
- [x] **T013** `web_search` intent + `prompts/search.md` with the untrusted-data
      delimiters.
- [x] **T014** Gateway-built `## Sources`, never the model's URLs.
- [x] **T015** Fall-through to plain chat on empty or failed search.
      *Evidence*: observed for real when every general engine was throttled.

## Images

- [x] **T016** `searchImages` (raster only — the icon engines answer any query
      with SVG logos).
- [x] **T017** `/media`: HMAC-authorised, SSRF-guarded, redirect-revalidating,
      type-allowlisted, 10 MB streamed cap, 404 on everything else. 15 tests.
- [x] **T018** Relative signed markdown, resolved on the phone against the
      current base URL; `errorBuilder` degrades to a tappable link.

## Verification

| Check | Result |
|---|---|
| `apps/gateway` unit tests | 169 passed |
| `apps/mobile` unit tests | 37 passed |
| `flutter analyze` | no issues |
| admin `tsc --noEmit` + `vite build` | clean |
| Intent fixture, 23 cases, EN + AR | 23/23, median 2.3s |
| Live: plain chat | 2.8s to first token |
| Live: "who is the current president of egypt?" | cited answer, sources match the results |
| Live: "show me a photo of a golden retriever" | two photographs rendered through the proxy |
| Live: signed public image | 200, `image/jpeg`, 663 KB |
| Live: loopback, metadata IP, compose service, tampered signature, SVG | all 404 |

### Not verified on hardware

Markdown and images have widget tests and a working proxy behind them, but
nobody has looked at a rendered bubble on a phone yet.
