# Hard Fork Acceptance Report

Version: 0.3.0-dev

Generated: 2026-05-10

## Scope

This report records the final acceptance pass for the OpenCode hard fork into the PaperCode paper workbench. The accepted product surface is PaperRun-first: users start from a Chinese research workbench, provide a topic, code path, data, logs, or paper materials, and the system coordinates provider/model roles, MCP, skills, agents, evidence ledgers, authenticity gates, preview, and export as a paper workflow rather than an ordinary chat session.

## Accepted Checks

- Paper core is authoritative under `packages/opencode/src/paper`; the former `packages/server` sidecar is absent.
- Public CLI, startup logo, default help, TUI tips, and default command registry expose PaperCode and PaperRun semantics instead of legacy OpenCode chat product surfaces.
- `PaperRun` is the first-class API/TUI state and includes intake, stage graph, Source Ledger, Claim Ledger, experiment status, Agent Tree, diagnostics, pause questions, preview, and export state.
- The TUI prompt parser accepts Chinese topic/code/material/data/log input and converts it to `PaperRunCreateRequest`.
- Nested multi-model agents are represented with parent/child ids, depth, role, provider/model, capabilities, budgets, artifacts, tool traces, and status.
- Budget tiers constrain depth, parallelism, live search, container reproduction, and cost caps; `submission` reaches depth 4.
- Private-first data egress blocks secret-like paths and records audit results before content can leave the workspace.
- `reviewable_bundle` and `submission_candidate` quality modes are present; failed authenticity gates block final export and forced drafts carry failed checks.
- Strict acceptance covers live provider smoke, Exa MCP live smoke, Nature skill/profile, pandoc, LaTeX, DOCX, topic-to-paper fixture run, code-to-paper fixture run, hard-fork checks, and Git Flow branch discipline.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/strict-acceptance.test.ts test/paper/hard-fork-acceptance.test.ts`
  - Passed: 6 pass, 0 fail, 53 expects.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\strict-acceptance.ps1`
  - Passed and wrote `reports/strict-live-acceptance.md`.

## Known Non-Blocking Test Notes

The full opencode suite still reports two todo tests and platform/fixture skips during strict acceptance. They are tracked by the upstream-derived test suite and did not block the hard fork acceptance criteria:

- `HttpApi /session/{missing}/todo returns 404 not 500`
- `Instruction.resolve fetches remote instructions from config URLs via HttpClient`

The strict run is a combined deterministic and live smoke acceptance. It verifies the integrated product surface and toolchain; future iteration should continue replacing remaining fixture-only stage behavior with richer live PaperRun execution and stronger runtime persistence.
