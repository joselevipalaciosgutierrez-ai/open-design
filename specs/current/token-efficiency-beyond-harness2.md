# Token efficiency: beyond Harness²

Status: working plan. Section 1 is built; everything else is proposed and
unmeasured. Baseline numbers must come from Langfuse section attribution
(`apps/daemon/src/langfuse-trace.ts`) before any item is promoted.

## What Harness² gives, and where it falls short for us

Harness² (google-research/harness2, arXiv 2610.14224) improves the files around a
frozen model: Propose → Probe → Compose, with behavior diffs instead of a grader.
Its own authors report the gaps we should close:

| Harness² gap | Our answer |
| --- | --- |
| Costs tokens per task (no spend cap) | Cost-bounded loop: every candidate edit must carry a token budget and is run on recorded traces from `mocks/`, never on live budget |
| Gains concentrate in weak models, selection can pick a worse output (55 over 95) | Pair every behavior diff with a hard regression gate (artifact lint + critique score) before adoption |
| A wrong premise shared by both candidates costs 2–11 points | Third "adversarial" candidate that removes a rule instead of adding one |
| Only instructs; just `plugin/*.ts` enforces | Default to enforcement in code for anything measurable (truncation, patch-only edits) |
| Library only grows | Evidence-based pruning: a rule never cited by a trace for N runs is a deletion candidate |

## 1. Built: per-conversation memory snapshot

`apps/daemon/src/memory-snapshot.ts`, wired in `server.ts` `composeDaemonSystemPrompt`.
Memory is part of the stable prefix and was named the dominant drift cause in
`stable-sections.ts`. A conversation now keeps the memory text it first saw;
only a user edit (manual upsert, index, config, delete) drops it. Auto-extractor
writes (`heuristic`, `llm`) no longer move the prefix mid-session.
Tests: `apps/daemon/tests/memory-snapshot.test.ts`.
Trade-off to confirm in review: facts the extractor learns mid-conversation reach
the next conversation, not the current one.

## 1b. Built: stepped compaction boundary

`conversation-history.ts`: the note/verbatim-tail boundary moves every 4
exchanges (older notes dropped in blocks of 10) so the compacted prompt extends
the previous turn's byte for byte between steps. Test: "prefix stability".

## 1c. Built: Design Craft as a pulled skill

Always-on charter 8,764 -> 6,933 tokens (-21%, filesystem profile).
`core-slim.ts` keeps a ~230-token digest (hard rules + pointer); the full
rulebook is `skills/design-craft/SKILL.md`, forced first into the run's global
skill index (`design-craft-delivery.ts`, `server.ts`). Text-artifact/BYOK runs
keep it inline (no file tools). Rollback: `OD_DESIGN_CRAFT=inline`.
A test keeps the inline text and the skill word for word.
NOT validated on live runs: whether agents reliably read the skill before
designing. That is the first thing the decision-point probe must check.
Also fixed: the memory snapshot ignored `extract` events; now only a person's
edit invalidates it (test updated in `intent-signal-stable-prompt-cache.test.ts`).

## 1d. Verdict on the earlier proposals (evidence so far)

| Proposal | Verdict |
| --- | --- |
| Volatility-ordered prefix | Already true in slim; dropped |
| Media / Direction library gating | Already done in production; dropped |
| Phase model routing | Dropped: the user chooses the model |
| Pull-based rulebooks via skills | Built (1c); needs live validation |
| Decision-point probe (counterfactual replay) | Keep; corpus is 179 traces in `mocks/recordings`, 13 with `<question-form>` |
| Token-level compression (LLMLingua) | Rejected: AGORA (arXiv 2605.26596) reports collapse on agents |
| Tool-output stubs, patch-only edits, subagent shared prefix | Unverified: need per-CLI capability check |

## 2. Proposed, ordered by expected saving

Measured 2026-10-23 on the slim prompt with the production profile
(filesystem, no media signal): ~8.8K tokens. Largest: Design Craft ~2.0K,
Artifact Design Phase ~1.9K, Requirements Clarification ~1.5K. Media is already
gated by intent signal and the Direction library already ships as a pull index
on filesystem runs, so neither is a candidate. (A first measurement on the
plain/BYOK profile showed 12.3K and overstated production.)

1. **Volatility-ordered prefix.** Already true for slim (`system.ts`: static
   charter, project-stable blocks, turn-variable blocks last). Nothing to do.
2. **Reversible stubs for old tool output.** Replace aged tool results with
   `read x.html, 800 lines, sha:abc` and keep the original on disk (same idea as
   `conversation.md`). Needs a check of what each CLI lets the daemon rewrite.
3. **Patch-only iteration.** After the first artifact, iterations edit by diff.
   Largest likely output-token saving; enforce in a tool-loop plugin, not the prompt.
4. **Phase-gated prompt.** discovery / design / iterate / export each load only their
   contracts; discovery and directions are dropped after turn 1.
5. **Compaction v2** for `conversation-history.ts`: threshold as a fraction of the
   model window instead of a fixed 24k chars, incremental summary update, and a
   stop rule when two passes in a row save under 10% (Hermes Agent technique).
6. **Phase model routing.** Cheap model for discovery/questions, strong model for
   generation and final review.
7. **Shared prefix for subagents.** Critique panel and subagents reuse the exact
   parent prefix so they hit the same cache.

## 3. Candidate novel combination (to validate, not claim)

"Evidence-pruned, enforcement-first harness": Harness²'s behavior-diff probe,
used in reverse. Instead of asking which edit improves the score, ask which
existing rule can be removed with no behavior change on recorded traces. The
saving compounds because removed tokens are paid on every run and every cache miss.
This is a hypothesis; the experiment is the first deliverable.

## Measurement before promotion

- Tokens per run by prompt section, cache read ratio, cost per finished artifact.
- Regression gate: same recorded trace, with and without the change, compared on
  artifact lint and critique score.
- Do not run the full daemon suite locally; use focused tests plus `pnpm guard`
  and `pnpm typecheck` (root AGENTS.md).
