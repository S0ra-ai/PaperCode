TaskFlow task: `task-032-opencode-paper-core-migration`

The authoritative papercode paper runtime has moved into the OpenCode hard fork.

## Changes

- Moved paper, research, and init runtime code into `packages/opencode/src/paper/`.
- Moved paper, research, and init tests into `packages/opencode/test/`.
- Removed the standalone `@papercode/server` workspace package.
- Updated strict acceptance commands to validate the migrated opencode paper runtime.
- Added `packages/opencode/test/paper/core-migration.test.ts` to assert the paper runtime is exported from `@/paper`.
- Synchronized papercode branding in server auth and installation tests after the runtime move.
- Hardened Windows test teardown for SQLite/temp-directory handles used by paper authoring tests.

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/provider/transform.test.ts test/server/auth.test.ts test/server/httpapi-bridge.test.ts test/server/httpapi-raw-route-auth.test.ts test/installation/installation.test.ts test/paper/authoring.test.ts test/paper/core-migration.test.ts test/init/init.test.ts test/paper/intake.test.ts test/research/contracts.test.ts`: passed, 194 pass, 0 fail.
- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/strict-acceptance.test.ts`: passed.
- `npx --yes bun@1.3.13 run --cwd packages/opencode typecheck`: passed.
- `npx --yes bun@1.3.13 --cwd packages/preview test`: passed, 2 pass, 0 fail.
- `$env:PYTHONPATH='research-tools/src'; python -m unittest discover -s research-tools/tests`: passed, 4 tests.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-readme-version.ps1`: passed.

## Full Suite Note

`npx --yes bun@1.3.13 --cwd packages/opencode test` was also run once before the targeted fixes. It completed with 2487 pass and 51 fail. The observed failures were concentrated in pre-existing Windows shell/path-parser expectations, generic session timeout flakes, and stale OpenCode branding assertions. The branding/installation/auth/provider/paper-authoring failures relevant to this migration were fixed and covered by the targeted green suite above.
