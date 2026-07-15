---
description: Resume an interrupted /feature pipeline run from its recorded state
---

Target: **$ARGUMENTS** (a `docs/pipeline/NNN-<slug>.md` path or a feature
number/slug; if empty, pick the most recently modified state file whose
`Status` is not `complete`).

You are the orchestrator, resuming a `/feature` run that was interrupted
(session ended, context compacted, or stopped mid-loop).

1. Read the pipeline state file: `Status`, `Current phase`, the recorded
   `Tier` and `Lightened/skipped phases`, the loop counters, the phase log, and
   the open-questions log. Honor the recorded Tier's per-phase depth for the rest
   of the run (do not re-triage) — the "Tier gate" lines in
   `.claude/commands/feature.md` govern what each remaining phase does.
2. Re-ground yourself in the artifacts it references: the spec in
   `docs/specs/`, any test plan, defects (check each defect's `Status`
   field), design review, and evidence directory.
3. If `Status: stopped`, present the recorded open items to the product owner
   (AskUserQuestion) before doing anything — a stopped run resumes only with
   their direction.
4. Continue the pipeline from `Current phase` following
   `.claude/commands/feature.md` exactly — same phase definitions, same
   batching rules, same loop bounds (the recorded iteration counters still
   count against the max-2 caps). Keep updating the state file after every
   phase. As in `/feature`, run every agent synchronously
   (`run_in_background: false`) and wait for its handoff before the next phase —
   a backgrounded agent is what makes a resumed run appear to stall again.
