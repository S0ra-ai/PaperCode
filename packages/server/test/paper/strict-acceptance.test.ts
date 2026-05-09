import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "fs"
import path from "path"

const repoRoot = path.resolve(import.meta.dir, "../../../..")
const scriptPath = path.join(repoRoot, "scripts", "strict-acceptance.ps1")

const requiredChecks = [
  "taskflow-validate-all",
  "readme-changelog-version",
  "tracked-secret-scan",
  "server-tests",
  "preview-tests",
  "python-tests",
  "server-typecheck",
  "workspace-typecheck",
  "opencode-tui-smoke",
  "live-provider-call",
  "exa-live-search",
  "nature-skill-profile",
  "pandoc-conversion",
  "latex-pdf-generation",
  "docx-generation",
  "topic-to-paper-live-run",
  "code-to-paper-live-run",
  "git-flow-cleanup",
]

describe("strict live acceptance script", () => {
  test("declares the complete required check inventory", () => {
    expect(existsSync(scriptPath)).toBe(true)
    const script = readFileSync(scriptPath, "utf8")
    for (const check of requiredChecks) expect(script).toContain(check)
  })

  test("keeps strict live checks strict while allowing deterministic fixture tests", () => {
    const script = readFileSync(scriptPath, "utf8")
    expect(script).toContain("[switch]$FixtureMode")
    expect(script).toContain("Assert-StrictLive")
    expect(script).toContain("Invoke-DeepSeekSmoke")
    expect(script).toContain("Invoke-ExaSmoke")
  })

  test("scans only tracked files for secrets and writes the markdown report", () => {
    const script = readFileSync(scriptPath, "utf8")
    expect(script).toContain("git grep")
    expect(script).toContain("sk-[A-Za-z0-9]")
    expect(script).toContain("reports/strict-live-acceptance.md")
  })
})
