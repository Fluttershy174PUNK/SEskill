# Skill evals

`evals.json` defines prompt, expected output, and assertion cases. To run the mechanical
filesystem/backend suite, from the repository root use:

```bash
node tests/run-evals.mjs
```

The runner exercises schema creation, embedded-data launchers, live schema revisions, validation,
malformed JSON, and version mismatch setup in isolated temporary projects. It does **not** execute
an LLM or grade semantic accuracy; the assertions about project inspection, intent recognition,
and human hand-off need a fresh-context agent run and evidence-based review.

To grade real agent-produced output, run each prompt in a fresh session, save generated artifacts
under `<run-dir>/<eval-id>/outputs/`, then grade objective schema/launcher invariants:

```bash
node tests/grade-evals.mjs <run-dir>
```

`eval_queries.json` contains positive and near-miss prompts for trigger evaluation. Triggering is
model/client-dependent; the repository's deterministic Node tests cannot claim an LLM invoked the
skill. Run those queries in fresh sessions with skill discovery enabled/disabled and record whether
`skills/seditor/SKILL.md` loaded.
