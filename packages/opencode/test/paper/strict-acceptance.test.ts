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
  "hard-fork-paper-core",
  "hard-fork-paperrun-api-tui",
  "hard-fork-agent-tree",
  "hard-fork-quality-egress",
  "hard-fork-public-branding",
  "observability-audit-coverage",
  "git-flow-cleanup",
]

describe("strict live acceptance script", () => {
  test("declares the complete required check inventory", () => {
    expect(existsSync(scriptPath)).toBe(true)
    const script = readFileSync(scriptPath, "utf8")
    for (const check of requiredChecks) expect(script).toContain(check)
  })

  test("keeps the PowerShell script ASCII-safe for Windows PowerShell parsing", () => {
    const script = readFileSync(scriptPath)
    expect([...script].every((byte) => byte < 0x80)).toBe(true)
  })

  test("does not assign reserved PowerShell variables", () => {
    const script = readFileSync(scriptPath, "utf8")
    expect(script).not.toMatch(/\$home\s*=/i)
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

  test("bounds each check and writes partial reports during execution", () => {
    const script = readFileSync(scriptPath, "utf8")
    expect(script).toContain("[int]$CheckTimeoutSeconds")
    expect(script).toContain("Wait-Job")
    expect(script).toContain("Stop-Job")
    expect(script).toContain("timed out after")
    expect(script).toContain("Write-Report")
    expect(script).toContain("Start-Sleep -Milliseconds")
    expect(script).toContain("[strict]")
  })

  test("uses focused paper-critical tests by default with opt-in full workspace suite", () => {
    const script = readFileSync(scriptPath, "utf8")
    expect(script).toContain("[switch]$FullWorkspaceSuite")
    expect(script).toContain("strict-live-focused")
    expect(script).toContain("strict-live-full")
    expect(script).toContain("test/paper/paperrun-execution.test.ts")
    expect(script).toContain("test/paper/observability-audit.test.ts")
  })

  test("uses real PaperRun benchmark evidence for live topic and code checks", () => {
    const script = readFileSync(scriptPath, "utf8")
    expect(script).toContain("scripts/live-paper-quality-benchmark.ts")
    expect(script).toContain('"--scenario", "topic"')
    expect(script).toContain('"--scenario", "code"')
    expect(script).not.toContain('"test/research/e2e.test.ts"')
  })

  test("allows Git Flow feature and fix branches during active task work", () => {
    const script = readFileSync(scriptPath, "utf8")
    expect(script).toContain("^(feature|fix)/[a-z0-9-]+$")
    expect(script).toContain("Git Flow feature/fix branch")
  })
})
