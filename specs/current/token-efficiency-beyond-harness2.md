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
Validation so far (2026-10-24, Claude haiku, small samples, not proof of quality):
- Read probe (own composed prompt, 6 design briefs + 1 control): the skill was read
  as the first action in 6/6 design runs and in 0/1 control.
- Through the real daemon (3 briefs x 2 reps per variant): skill read in 4/6 runs
  (1 run delegated to an agent profile, 1 designed without reading and linted clean).
  Linter findings on the 6 artifacts: pull P0=0 P1=1 P2=1; inline P0=2
  (`invented-metric` in both pricing pages) P1=0 P2=1. Too few runs to call either
  variant better; it shows no sign that pull is worse on what the linter checks.
- Prompt actually sent (od run budget): inline ~13,456 tokens, pull ~11,712
  (-1,744, -13%).
The linter checks a subset of design quality; nothing here judges layout, taste or
usability.
Also fixed: the memory snapshot ignored `extract` events; now only a person's
edit invalidates it (test updated in `intent-signal-stable-prompt-cache.test.ts`).

## 1c-bis. Design-craft now belongs to the Design agent

The app seeds one agent, Design (`default-agents.ts`), once the person has chosen a CLI.
It owns the `design-craft` skill, is an ordinary profile (editable, deletable) and a
deletion is permanent (`seeded_defaults` row). `design-craft` is no longer forced into
every run's skill index. Each run's charter now carries one of three things
(`design-craft-delivery.ts`): the digest plus a pointer when the run owns the skill, the
hard rules only when it does not, or the whole rulebook (BYOK, skill missing,
`OD_DESIGN_CRAFT=inline`). The default assistant carries the skill only while no agent
owns it. The orchestrator directive routes design to the design agent and, with none,
offers to create one (never without asking). `OD_SEED_DEFAULT_AGENTS=off` disables seeding
(the test setup uses it).

Measured (`od run budget`, Claude haiku): Design agent run ~9,793 tokens; default
assistant run ~11,630 (it is an orchestrator run as soon as any agent exists, which adds
the directive, ~2.0K). The saving of this change on its own is small (~90-190 tokens per
run); the point is ownership: only the agent that designs reads the rules.

## 1c-ter. Questions between the person, the orchestrator and an agent

Protocol (2026-10-24): the orchestrator asks what changes the result before it orders
(one `<question-form>`, a "You decide" option per question) and hands the answers over as
`[form answers — orchestrator]`; a delegated run drops its own requirements round
(`DELEGATE_QUESTIONS` replaces ~1.6K tokens of form format with ~230) and, when truly
blocked, ends with one `<needs-input>` block instead of a `<question-form>`; the compact
return of `od run start --follow` shows `finished: needs input`, the questions and how to
resume the same conversation (`run-follow-summary.ts`).

Why not a form: Antigravity and Cursor (`resumeSkipsAfterQuestionForm`) do not continue
their own session after a `<question-form>` because the model re-emits it, so the answer
rides a cold turn that resends the whole prompt. Measured answer turn (`od run budget`,
one sample each): Claude after a form 2,028 tokens (resumes); Antigravity after a form
10,208 (rules resent); Antigravity after a `<needs-input>` block 1,965 (resumed, did not
ask again, built the page).

Found along the way: the orchestrator directive embedded each agent's track record, which
changes whenever an order finishes, so the turn after every delegation resent the whole
prompt (12.7K tokens, cache miss `stable-prompt-changed`/`unattributed`) instead of ~2K.
The record now rides in the per-turn part (`renderAgentRecords`). Re-measured on an
isolated daemon: orchestrator turn after the delegation 1,609 tokens (cache hit), the
next one 1,658. Delegate prompt: `daemonSystemPrompt` 5,963 vs 6,747 (-784) for the
delegated charter.

Not covered (see 1c-quater for the resumed-turn part): the OD Next path composes its orchestrator prompt separately and still
lacks the per-turn records; the sample sizes are one run each.

## 1c-quater. Resumed turns: keyed protocol split from its key

A resumed classic turn resent ~1,550 tokens that never changed: the keyed host
protocols (done marker, follow-up suggestions, artifact focus, ~1,100) because the
nonce sits inside the text, and the Design Files workspace rules (~340) next to a
file list that does change. OD Next's resumed turn is 288 because it carries neither.

Now (`host-protocol-delivery.ts`, `renderChatTurnHostProtocolTemplate`,
`splitDesignFilesWorkspaceHint`): the rules ride the stable slice once and each turn
sends `Turn key: <key>` plus the file snapshot. A test puts a real key back into the
template and expects the old text word for word. Rollback: `OD_HOST_PROTOCOL=inline`.
Classic route only; OD Next is untouched.

Measured (Claude haiku, isolated daemon, 5 conversations x 3 turns per variant, counted
from the daemon's parsed `done_key` / `next_steps` / `artifact_focus` events, which are
only emitted for a correct key):

| | split | inline |
| --- | --- | --- |
| done marker | 15/15 | 15/15 |
| three follow-ups | 15/15 | 11/15 |
| focus on build turns | 9/9 | 10/10 |
| tokens, resumed turn | 253 | 1,554 |

First turn is ~130 tokens larger (preface). Sample is small: it rules out a gross
loss in key copying, not a small one. Sampled load during a run: one core busy and
~1.5-2 GB across daemon, agent CLIs and anything else under the repo path.

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
