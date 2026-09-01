# Feature Specification: Readable Replies, Web Search, Inline Images

**Feature Branch**: `007-search-and-rendering`

**Created**: 2026-09-01

**Status**: Implemented

**Input**: User description: "Replies are weak, Botvy cannot look anything up,
and what it says arrives as a wall of raw text."

## Why this feature exists

Three complaints with three separate causes, none of which was the assistant's
writing:

- The app rendered replies with `SelectableText` and had no markdown package,
  so the headings, bold and links the model already emits arrived as literal
  `#` and `**` characters.
- Nothing could reach the internet, so any question about today had to be
  answered from training data or not at all.
- The model spent half its time on the CPU. qwen3:4b at a 16k context did not
  fit a 4 GB card: 52% of it spilled, at 68 seconds to the first token.

Staying fully local is a settled decision, so the fix was a model that fits the
card entirely, plus the architecture around it.

## What was found while building it

Two measurements overturned the plan this was built from, and both are the
reason the numbers moved:

| Assumption | What measurement showed |
|---|---|
| Pin `num_ctx` per call: 8k for chat, 4k for extraction | Ollama keys a loaded model by context size. Two values unload and reload it on **every turn** — 39s to first token, nearly all reload. One value: 2.8s. |
| Keep the intent schema requiring all six fields | A JSON schema is a decoding grammar: every required key is tokens emitted before the answer starts. Six fields cost 48 tokens and 3s per turn; one costs 19 and 1.5s. |

A third came from the fixture rather than the plan: asked for UTC timestamps,
a 3b model returns the wrong hour *and* the wrong day. Timezone arithmetic is
now code's job — the model writes the user's own wall clock.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A reply reads like a document (Priority: P1)

**Acceptance**: a reply containing a heading, a bullet list and a link renders
as those things. A user's own `*.dart` stays literal. Selecting text works
across the whole conversation, not one paragraph at a time.

### User Story 2 - Botvy can look things up (Priority: P1)

**Acceptance**: "who is the current president of egypt?" returns an answer
citing numbered sources whose URLs match the search results exactly. Stopping
the search container produces an ordinary reply, never an error.

### User Story 3 - It can show me something (Priority: P2)

**Acceptance**: "show me a photo of a golden retriever" renders photographs in
the bubble. A broken one becomes a tappable link.

### User Story 4 - It answers quickly enough to use (Priority: P1)

**Acceptance**: first token in single-digit seconds on the 4 GB card, with the
model fully resident in VRAM.

## Requirements *(mandatory)*

- **FR-001** Assistant replies MUST render as markdown; user messages MUST NOT.
- **FR-002** Links MUST open externally and MUST be restricted to http(s).
- **FR-003** The model MUST fit in VRAM. `OLLAMA_NUM_CTX` MUST apply to every
  call — one context size per loaded model.
- **FR-004** `think` MUST be sent only to a model that supports it; qwen2.5
  answers `"does not support thinking"` and fails the call.
- **FR-005** Search MUST be triggered by the existing grammar-constrained
  classifier, before any web text exists, so a snippet cannot cause an action.
- **FR-006** A statement about the user MUST NOT be sent to a search engine.
- **FR-007** Snippets MUST be stripped of markup and truncated before entering
  a prompt, and wrapped in delimiters that name them as untrusted data.
- **FR-008** The source list MUST be built by the gateway from the results, not
  copied from the model's output.
- **FR-009** A failed or empty search MUST fall through to an ordinary reply.
- **FR-010** Images MUST be proxied, never hotlinked, and the proxy MUST be
  authorised by an HMAC rather than a bearer token.
- **FR-011** The proxy MUST reject non-public addresses, re-checking every
  redirect, and MUST allowlist raster types only — SVG carries script.
- **FR-012** Every proxy failure MUST answer 404 and nothing else.
- **FR-013** Relative and bare times MUST be resolved in code, not by the model.

## Assumptions

- SearXNG is a metasearch front-end with no uptime contract, and a single home
  IP is throttled by DuckDuckGo, Brave and Startpage within an afternoon of
  testing. Several general engines are configured so one that still answers is
  enough; when none do, the fall-through covers it.
- Snippets only, no page fetching. Five snippets are 1–2k prompt tokens; one
  extracted page is 3–10k plus an HTML-extraction dependency.
- DNS-rebinding is not defended against: the address is resolved once and
  `fetch` resolves again. Closing that needs a custom dispatcher, and this
  proxy is reachable only by someone holding a signature.
- A poisoned reply persists into history and could bias the next turn's
  classification. Worst case is a visible, cancellable reminder.

## Out of scope

- Page fetching, and any server-side image cache (unbounded, no eviction; the
  phone's own image cache covers scrolling).
- Token buffering while streaming. ~30 rebuilds a second over a few KB has not
  janked; `chat_controller.dart` already marks where a buffer would go.
- A shared cloud database. Chat history and accounts are more sensitive than
  the prompts the local-only decision was made for, and every query would
  cross the internet to reach a machine in the same room.
