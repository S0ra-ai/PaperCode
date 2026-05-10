# Paper Profile Skills

> Historical path note: this report predates task-032. Any `packages/server` or `@paper-fucker/server` paths below are provenance only; the current paper_fucker runtime authority is `packages/opencode/src/paper`, and `packages/server` is intentionally absent.

Version: 0.1.21-dev

Task: `task-024-paper-profile-skills`

## Summary

paper_fucker now has a first-party paper profile registry for submission-aware structure and checks. Profiles are domain guidance and gate inputs; they do not bypass authenticity checks for claims, references, data, code, or reproduction.

## Implemented

- Added `PaperProfile.v1` and `PaperProfileCheck.v1` domain types.
- Added a registry with duplicate and missing profile diagnostics.
- Added built-in profile ids:
  - `nature-paper`
  - `ieee-paper`
  - `acm-paper`
  - `springer-paper`
  - `generic-preprint`
- Added Nature profile official-source refresh policy.
- Added profile check output with `blockers` and `warnings` for gate integration.
- Installed first-party `nature-paper` skill at `.paper_fucker/skills/nature-paper/SKILL.md`.

## Official Source Handling

The Nature skill and profile point runtime workers at official Nature pages and require fresh retrieval during a run. They intentionally do not freeze Nature requirements as permanent constants.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/server test test/paper/profiles.test.ts`
  - Result: 4 pass, 0 fail, 12 expects.

Further repository verification is recorded in the TaskFlow step log.
