import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "fs"
import path from "path"

const repoRoot = path.resolve(import.meta.dir, "../../../..")
const scriptPath = path.join(repoRoot, "scripts", "strict-acceptance.ps1")
const autonomousAuditPath = path.join(repoRoot, "scripts", "autonomous-product-audit.ps1")

const requiredChecks = [
  "taskflow-validate-all",
  "readme-changelog-version",
  "development-docs-check",
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
  "live-preview-browser-smoke",
  "live-crawler-fetch",
  "hf-live-research-loop",
  "topic-to-paper-live-run",
  "code-to-paper-live-run",
  "final-export-pass-run",
  "hard-fork-paper-core",
  "hard-fork-paperrun-api-tui",
  "hard-fork-agent-tree",
  "hard-fork-quality-egress",
  "hard-fork-public-branding",
  "observability-audit-coverage",
  "agent-team-capability-fusion",
  "paper-workbench-ux-sidebar",
  "hf-no-mock-boundary",
  "changelog-split-archives",
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
    expect(script).toContain("Invoke-LiveProviderRequest")
    expect(script).toContain("live provider request failed after")
    expect(script).toContain("Start-Sleep -Seconds")
    expect(script).toContain("-Attempts 3")
    expect(script).toContain("Invoke-ExaSmoke")
  })

  test("scans only tracked files for secrets and writes the markdown report", () => {
    const script = readFileSync(scriptPath, "utf8")
    expect(script).toContain("git grep")
    expect(script).toContain("sk-[A-Za-z0-9]")
    expect(script).toContain("reports/strict-live-acceptance.md")
    expect(script).toContain("check-development-docs.ps1")
    expect(script).toContain('".\\scripts\\check-development-docs.ps1", "-Render"')
  })

  test("bounds each check and writes partial reports during execution", () => {
    const script = readFileSync(scriptPath, "utf8")
    expect(script).toContain("[int]$CheckTimeoutSeconds")
    expect(script).toContain("[int]$OutputLineLimit")
    expect(script).toContain("Wait-Job")
    expect(script).toContain("Stop-Job")
    expect(script).toContain("timed out after")
    expect(script).toContain("Write-Report")
    expect(script).toContain("Get-CurrentProjectVersion")
    expect(script).toContain("- Project version: $(Get-CurrentProjectVersion)")
    expect(script).toContain("Start-Sleep -Milliseconds")
    expect(script).toContain("[strict]")
  })

  test("uses focused paper-critical tests by default with opt-in full workspace suite", () => {
    const script = readFileSync(scriptPath, "utf8")
    expect(script).toContain("[switch]$FullWorkspaceSuite")
    expect(script).toContain("strict-live-focused")
    expect(script).toContain("strict-live-full")
    expect(script).toContain("test/paper/paperrun-execution.test.ts")
    expect(script).toContain("test/paper/runtime-state.test.ts")
    expect(script).toContain("test/paper/observability-audit.test.ts")
    expect(script).toContain("test/paper/agent-team-capability-acceptance.test.ts")
  })

  test("checks Agent Team capability fusion and product no-mock boundaries", () => {
    const script = readFileSync(scriptPath, "utf8")
    expect(script).toContain("Invoke-AgentTeamCapabilityFusion")
    expect(script).toContain("Invoke-PaperWorkbenchUXSidebar")
    expect(script).toContain("Invoke-HFNoMockBoundary")
    expect(script).toContain("network_not_authorized")
    expect(script).toContain("Invoke-ChangelogSplitArchives")
    expect(script).toContain("Root CHANGELOG should keep exactly one active history entry.")
    expect(script).not.toContain('0\\.8\\.')
  })

  test("uses real PaperRun benchmark evidence for live topic and code checks", () => {
    const script = readFileSync(scriptPath, "utf8")
    expect(script).toContain("scripts/live-paper-quality-benchmark.ts")
    expect(script).toContain("Invoke-LivePaperBenchmark")
    expect(script).toContain('"--scenario", $Scenario')
    expect(script).toContain("-OutputLineLimit 0")
    expect(script).toContain('Invoke-LivePaperBenchmark "topic"')
    expect(script).toContain('Invoke-LivePaperBenchmark "code"')
    expect(script).toContain('Invoke-LivePaperBenchmark "final"')
    expect(script).toContain("SourceEvidenceManifest.v1")
    expect(script).toContain("final_gate=passed")
    expect(script).toContain("[System.Text.Encoding]::UTF8")
    expect(script).not.toContain('"test/research/e2e.test.ts"')
  })

  test("live benchmark discovers arXiv sources instead of pinning a fake locator", () => {
    const benchmark = readFileSync(path.join(repoRoot, "scripts", "live-paper-quality-benchmark.ts"), "utf8")
    expect(benchmark).toContain("discoverVerifiedArxivSource")
    expect(benchmark).toContain("assertAuthenticVerifiedArxivSources")
    expect(benchmark).toContain("assertNoBenchmarkSourceResidue")
    expect(benchmark).toContain("assertNoBenchmarkSourceResidue(finalMarkdown")
    expect(benchmark).toContain('const outputDir = path.join(scenarioOutputRoot, "attempts", attemptId)')
    expect(benchmark).toContain('const workspace = path.join(outputDir, "workspace")')
    expect(benchmark).not.toContain('await rm(outputDir, { recursive: true, force: true })')
    expect(benchmark).toContain('await writeFile(summaryPath, content, "utf8")')
    expect(benchmark).toContain('await rename(tmpSummaryPath, publishedSummaryPath)')
    expect(benchmark).toContain("source.source_id === `paper:arxiv:${source.arxiv_id}`")
    expect(benchmark).toContain("source.url === `https://arxiv.org/abs/${source.arxiv_id}`")
    expect(benchmark).toContain("live-arxiv-search+abs-page")
    expect(benchmark).toContain("liveArxivRankingDataset")
    expect(benchmark).toContain("dataset_paths: [datasetPath]")
    expect(benchmark).not.toMatch(/fetchVerifiedArxivSource\(["']\d{4}\.\d{4,5}["']/)
    expect(benchmark).not.toContain("2401.00001")
    expect(benchmark).not.toContain("paper-a")
    expect(benchmark).not.toContain("Evidence-grounded agent teams")
    expect(benchmark).not.toContain("source discovery seed")
    expect(benchmark).not.toContain("search-seed")
  })

  test("experiment runner does not invent container image or digest metadata", () => {
    const runner = readFileSync(
      path.join(repoRoot, "packages", "opencode", "src", "paper", "research", "experiments", "runner.ts"),
      "utf8",
    )
    expect(runner).not.toContain("paper-fucker/research-runner:fixture")
    expect(runner).not.toContain("sha256:fixture")
    expect(runner).toContain("if (options?.container_image) result.image = options.container_image")
    expect(runner).toContain("if (options?.container_digest) result.digest = options.container_digest")
  })

  test("allows Git Flow feature and fix branches during active task work", () => {
    const script = readFileSync(scriptPath, "utf8")
    expect(script).toContain("^(feature|fix)/[a-z0-9-]+$")
    expect(script).toContain("Git Flow feature/fix branch")
  })

  test("autonomous audit does not count stale strict reports as current evidence", () => {
    const script = readFileSync(autonomousAuditPath, "utf8")
    expect(script).toContain("Get-CurrentVersion")
    expect(script).toContain("Get-ReportProjectVersions")
    expect(script).toContain("Get-ReportHeaderVersion")
    expect(script).toContain("Get-StaleReportVersions")
    expect(script).toContain("reports/strict-live-acceptance.md")
    expect(script).toContain("reports/strict-live-full-acceptance.md")
    expect(script).toContain("No current strict live report is usable")
    expect(script).toContain("project version header missing")
    expect(script).toContain("Full workspace report is stale")
    expect(script).toContain('Add-AuditResult "full-workspace-evidence" "warn"')
  })

  test("autonomous audit locks active and archived report governance", () => {
    const script = readFileSync(autonomousAuditPath, "utf8")
    expect(script).toContain("Test-ReportGovernance")
    expect(script).toContain("reports/README.md")
    expect(script).toContain("reports/archive")
    expect(script).toContain("Active full workspace report is not current")
    expect(script).toContain("strict-live-full-acceptance-[0-9]+")
    expect(script).toContain('Add-AuditResult "report-governance" "pass"')
  })

  test("autonomous audit locks PaperCode visible command surface", () => {
    const script = readFileSync(autonomousAuditPath, "utf8")
    expect(script).toContain("Test-VisibleCommandSurface")
    expect(script).toContain("PaperVisibleCommandRegistry")
    expect(script).toContain('"models", "status", "file", "folder", "data", "log", "preview", "export", "stop", "resume"')
    expect(script).toContain('"connect", "agents", "variants", "session", "sessions", "provider", "providers"')
    expect(script).toContain("Command palette/autocomplete filter missing")
    expect(script).toContain('Add-AuditResult "visible-command-surface" "pass"')
  })

  test("autonomous audit locks PaperRun model routing boundaries", () => {
    const script = readFileSync(autonomousAuditPath, "utf8")
    expect(script).toContain("Test-ModelRoutingBoundary")
    expect(script).toContain("forced_model_not_allowed")
    expect(script).toContain("model_allowlist_empty")
    expect(script).toContain("decision_model_missing")
    expect(script).toContain("requestedRoleModels")
    expect(script).toContain("does not let request model_roles bypass the user allowlist")
    expect(script).toContain('Add-AuditResult "model-routing-boundary" "pass"')
  })

  test("autonomous audit locks CJC heading format boundaries", () => {
    const script = readFileSync(autonomousAuditPath, "utf8")
    expect(script).toContain("Test-CJCFormatBoundary")
    expect(script).toContain("function cjcNumberedChildMarkdown")
    expect(script).toContain("numbers raw CJC child headings without touching fenced code")
    expect(script).toContain("experimental_setup: { order: 410")
    expect(script).toContain("reproducibility: { order: 600")
    expect(script).toContain('Add-AuditResult "cjc-format-boundary" "pass"')
  })
})
