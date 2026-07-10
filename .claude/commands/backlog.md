---
description: Manage the feature backlog (add | list | next) — the queue and spec-number registry for multi-feature work
---

Subcommand and arguments: **$ARGUMENTS**

You are the orchestrator managing `docs/backlog.md`. If the file does not
exist yet, create it with this structure:

```
# Feature backlog

Statuses: queued → in-progress → done (or dropped).
`Spec NNN` is allocated when an item goes in-progress — this table is the
spec-number registry, which is what prevents NNN collisions when features
run concurrently (e.g. in parallel worktrees).

| ID | Ask | Priority | Status | Spec NNN |
|---|---|---|---|---|
```

Subcommands:

- **add "<ask>" [priority]** — append a row: next free ID (B1, B2, …), the
  ask verbatim, priority (high | normal | low, default normal), status
  `queued`, Spec NNN empty. Do not start work.
- **list** — show the table, queued items first by priority, then
  in-progress, then the rest. Flag any in-progress item that has no matching
  `docs/pipeline/` state file (likely interrupted — suggest
  `/feature-resume`).
- **next** — take the highest-priority `queued` item, allocate the next spec
  number NNN (max of: highest NNN in `docs/specs/`, highest NNN already
  allocated in this table) + 1, set the row to `in-progress` with that NNN,
  and run the `/feature` pipeline (`.claude/commands/feature.md`) on the ask,
  passing the allocated NNN so Phase 0 uses it. On final acceptance, set the
  row to `done`.

If `$ARGUMENTS` is empty, treat it as `list`.
