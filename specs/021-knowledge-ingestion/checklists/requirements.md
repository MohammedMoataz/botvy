# Specification Quality Checklist: Knowledge Ingestion (P7)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details — spec.md never names readability, youtubei.js or chunk sizes
- [x] Focused on user value — saved links become a program
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers — personal fetching under a daily quota, playlist cap with no way to ask for the rest, images-only media, model-dependent quality and tag-based matching are all stated as assumptions
- [x] Requirements testable and unambiguous — FR-001…FR-017, including the never-execute rule
- [x] Success criteria measurable — SC-001…SC-007; the faithfulness review is named as a reviewed fixture and the one-screen criterion (SC-006) is a word count and three fields the same fixture run asserts
- [x] Success criteria technology-agnostic
- [x] All acceptance scenarios defined — 4 stories
- [x] Edge cases identified — paywall, huge playlist, a playlist child already saved standalone, no transcript, model outage and worker crash, the daily quota, changed source, off-topic link, embedded instruction
- [x] Scope clearly bounded — no reader view, highlights or search
- [x] Dependencies and assumptions identified, including the platform-terms caveat

## Feature Readiness

- [x] All functional requirements have acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes
- [x] No implementation details leak into specification

## Phase-specific

- [x] plan.md carries the constitution check (v2.1.1) and justifies the pipeline ports and per-video children
- [x] Every FR maps to a task (001 → T720/T741, 002 → T703/T722, 003 → T721/T723, 004 → T720/T721, 005 → T720/T722, 006 → T711/T713, 007 → T713, 008 → T724, 009 → T730, 010 → T731, 011 → T730, 012 → T721, 013 → T733, 014 → T723/T726/T743, 015 → T720/T750, 016 → T725, 017 → T721/T725)
- [x] Every SC has something that proves it (001/002 → gate 4, 003 → T730, 004/006 → T751, 005 → T733, 007 → T725 and gate 5)
- [x] Nothing leaves the context except as an event or a query — accept raises `knowledge.SuggestionAccepted` for Training rather than dispatching its command (T731), and the outcome comes back as Training's own events (T734)
- [x] Both schema-decoded passes have the plain-reply fallback principle III requires (T713, T730)
- [x] A pipeline that stops arriving is visible — heartbeat on every run (T721), degraded `/health` and a re-queue sweep (T725)
- [x] Fetched content is treated as data everywhere it appears in a prompt
- [x] Verification gate includes a reviewed quality fixture, not only pass/fail tests

## Notes

- Validation run 2026-09-05: all items pass.
- Re-validated 2026-09-06 after the analysis pass: the cross-context accept path, the
  structured-decoding fallbacks, the crash and outage story, queue visibility, the
  administrator's clear command and the per-member quota were added; SC-006 was replaced
  with a criterion the fixture run can check. Media is images only and a large playlist
  keeps only its first batch, both recorded as assumptions rather than requirements.
