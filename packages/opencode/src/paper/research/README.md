# paper_fucker Research Runtime Boundaries

This directory is the first-party paper_fucker research runtime. Domain logic for paper generation belongs here, not in `packages/opencode`.

## First-Party Modules

- `runtime/`: run storage, facts, artifacts, permissions, resources, cost, final gate state, and Python bridge calls.
- `orchestrator/`: automatic topic-to-paper stage graph, pause policy, guidance queue, and run controls.
- `templates/`: trusted template resolution and Markdown-to-LaTeX application.
- `sources/`: literature and dataset discovery, source verification, license checks, and feasibility turns.
- `experiments/`: experiment planning, host exploration, container reproduction, and result analysis.
- `writing/`: ClaimLedger-first writing, Markdown streaming, checkpoint guidance, diff, and rollback.
- `verification/`: final authenticity checks, blocking reports, review reports, and multi-model review aggregation.
- `export/`: final and forced-draft export bundles and manifests.

## Upstream Boundary

`packages/opencode` remains the upstream-derived agent/tool/session/model/TUI substrate. New paper_fucker research contracts, stage state, gates, and export logic should be added under this runtime and integrated through explicit adapters when substrate behavior is needed.
