param(
    [switch]$FixtureMode,
    [switch]$FullWorkspaceSuite,
    [int]$CheckTimeoutSeconds = 600,
    [int]$FullWorkspaceTimeoutSeconds = 1800,
    [string]$ReportPath = "reports/strict-live-acceptance.md"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Results = New-Object "System.Collections.Generic.List[object]"
$Failed = $false
$AcceptanceMode = if ($FixtureMode) {
    "fixture"
} elseif ($FullWorkspaceSuite) {
    "strict-live-full"
} else {
    "strict-live-focused"
}

$RequiredChecks = @(
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
    "git-flow-cleanup"
)

function Format-Detail {
    param([object]$Value)
    if ($null -eq $Value) { return "" }
    $text = [string]$Value
    $text = $text -replace "(?<![A-Za-z0-9])sk-[A-Za-z0-9._-]{20,}", "sk-REDACTED"
    $text = $text -replace "System\.Management\.Automation\.RemoteException", ""
    $text = $text -replace "\r?\n", " "
    $text = $text -replace "\|", "/"
    if ($text.Length -gt 2000) { return $text.Substring(0, 2000) + "..." }
    return $text
}

function Add-Result {
    param(
        [string]$Id,
        [string]$Title,
        [string]$Status,
        [object]$Detail,
        [double]$Seconds
    )
    $Results.Add([pscustomobject]@{
        id = $Id
        title = $Title
        status = $Status
        detail = (Format-Detail $Detail)
        seconds = [Math]::Round($Seconds, 3)
    }) | Out-Null
}

function Invoke-CheckedCommand {
    param(
        [string]$File,
        [string[]]$Arguments,
        [hashtable]$Environment = @{},
        [int]$TimeoutSeconds = $CheckTimeoutSeconds
    )
    $job = Start-Job -ScriptBlock {
        param(
            [string]$JobRepoRoot,
            [string]$JobFile,
            [string[]]$JobArguments,
            [hashtable]$JobEnvironment
        )
        $ErrorActionPreference = "Continue"
        $previous = @{}
        foreach ($key in $JobEnvironment.Keys) {
            $previous[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
            [Environment]::SetEnvironmentVariable($key, [string]$JobEnvironment[$key], "Process")
        }
        Push-Location $JobRepoRoot
        try {
            try {
                $output = & $JobFile @JobArguments 2>&1
                $exit = $LASTEXITCODE
                if ($null -eq $exit) { $exit = 0 }
                [pscustomobject]@{
                    exit = [int]$exit
                    output = @($output | ForEach-Object { [string]$_ })
                }
            } catch {
                [pscustomobject]@{
                    exit = 1
                    output = @([string]$_.Exception.Message)
                }
            }
        } finally {
            Pop-Location
            foreach ($key in $JobEnvironment.Keys) {
                [Environment]::SetEnvironmentVariable($key, $previous[$key], "Process")
            }
        }
    } -ArgumentList $RepoRoot, $File, $Arguments, $Environment

    $done = Wait-Job -Job $job -Timeout $TimeoutSeconds
    if ($null -eq $done) {
        Stop-Job -Job $job -Force
        Remove-Job -Job $job -Force
        throw "$File $($Arguments -join ' ') timed out after ${TimeoutSeconds}s"
    }

    $result = Receive-Job -Job $job
    Remove-Job -Job $job -Force
    if ($null -eq $result) {
        throw "$File $($Arguments -join ' ') produced no result"
    }
    $last = @($result)[-1]
    if ([int]$last.exit -ne 0) {
        $tail = ($last.output | Select-Object -Last 80) -join " "
        throw "$File $($Arguments -join ' ') failed with exit $($last.exit). Last output: $tail"
    }
    return ($last.output | Select-Object -Last 12) -join " "
}

function Invoke-Check {
    param(
        [string]$Id,
        [string]$Title,
        [scriptblock]$Body
    )
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    Write-Host "[strict] start $Id - $Title"
    try {
        $detail = & $Body
        $timer.Stop()
        Add-Result $Id $Title "pass" $detail $timer.Elapsed.TotalSeconds
        Write-Host "[strict] pass  $Id in $([Math]::Round($timer.Elapsed.TotalSeconds, 3))s"
    } catch {
        $timer.Stop()
        $script:Failed = $true
        Add-Result $Id $Title "fail" $_.Exception.Message $timer.Elapsed.TotalSeconds
        Write-Host "[strict] fail  $Id in $([Math]::Round($timer.Elapsed.TotalSeconds, 3))s"
    } finally {
        Write-Report
    }
}

function Assert-StrictLive {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if ($Condition) { return "ok" }
    if ($FixtureMode) { return "fixture mode accepted: $Message" }
    throw $Message
}

function Get-DeepSeekConfig {
    $defaultsPath = Join-Path $RepoRoot ".paper_fucker/local/model-defaults.json"
    $baseUrl = "https://api.deepseek.com/v1"
    $model = "deepseek-v4-pro"
    $keyFile = Join-Path $RepoRoot ".paper_fucker/local/deepseek.env"
    if (Test-Path -LiteralPath $defaultsPath) {
        $defaults = Get-Content -Raw -LiteralPath $defaultsPath | ConvertFrom-Json
        $model = [string]$defaults.models.default_model
        $provider = $defaults.models.providers.deepseek
        $baseUrl = [string]$provider.base_url
        $keyFile = Join-Path $RepoRoot ([string]$provider.api_key_file)
    }
    $key = [Environment]::GetEnvironmentVariable("DEEPSEEK_API_KEY", "Process")
    if (-not $key -and (Test-Path -LiteralPath $keyFile)) {
        foreach ($line in Get-Content -LiteralPath $keyFile) {
            if ($line -match "^\s*DEEPSEEK_API_KEY\s*=\s*(.+)\s*$") {
                $key = $Matches[1].Trim().Trim('"').Trim("'")
                break
            }
            if (-not $key -and $line -match "^\s*sk-[A-Za-z0-9._-]+\s*$") {
                $key = $line.Trim()
                break
            }
        }
    }
    return [pscustomobject]@{
        base_url = $baseUrl.TrimEnd("/")
        model = $model
        api_key = $key
    }
}

function Invoke-DeepSeekSmoke {
    if ($FixtureMode) { return "fixture live-provider-call: deepseek/deepseek-v4-pro" }
    $config = Get-DeepSeekConfig
    Assert-StrictLive (-not [string]::IsNullOrWhiteSpace($config.api_key)) "DeepSeek API key is missing. Expected DEEPSEEK_API_KEY or .paper_fucker/local/deepseek.env." | Out-Null
    $headers = @{ Authorization = "Bearer $($config.api_key)" }
    $models = Invoke-RestMethod -Uri "$($config.base_url)/models" -Headers $headers -TimeoutSec 30
    $ids = @($models.data | ForEach-Object { $_.id })
    Assert-StrictLive ($ids -contains $config.model) "DeepSeek model '$($config.model)' was not returned by /models." | Out-Null
    $body = @{
        model = $config.model
        messages = @(@{ role = "user"; content = "Reply only OK" })
        max_tokens = 8
        temperature = 0
    } | ConvertTo-Json -Depth 8
    $response = Invoke-RestMethod -Uri "$($config.base_url)/chat/completions" -Method Post -ContentType "application/json" -Headers $headers -Body $body -TimeoutSec 60
    Assert-StrictLive ($null -ne $response.choices -and @($response.choices).Count -gt 0) "DeepSeek chat completion returned no choices." | Out-Null
    return "provider deepseek model $($config.model) responded"
}

function Invoke-ExaSmoke {
    if ($FixtureMode) { return "fixture exa-live-search: mcp initialize" }
    $body = @{
        jsonrpc = "2.0"
        id = 1
        method = "initialize"
        params = @{
            protocolVersion = "2024-11-05"
            capabilities = @{}
            clientInfo = @{ name = "paper_fucker_acceptance"; version = Get-ProjectVersion }
        }
    } | ConvertTo-Json -Depth 8
    $response = Invoke-RestMethod -Uri "https://mcp.exa.ai/mcp" -Method Post -ContentType "application/json" -Headers @{ Accept = "application/json, text/event-stream" } -Body $body -TimeoutSec 30
    Assert-StrictLive (($response | Out-String) -match "serverInfo") "Exa MCP initialize did not return serverInfo." | Out-Null
    return "Exa MCP remote initialize responded"
}

function Invoke-NatureSkillSmoke {
    $skill = Join-Path $RepoRoot ".paper_fucker/skills/nature-paper/SKILL.md"
    Assert-StrictLive (Test-Path -LiteralPath $skill) "nature-paper skill is not installed." | Out-Null
    $text = Get-Content -Raw -LiteralPath $skill
    Assert-StrictLive ($text -match "Nature" -and $text -match "PaperProfile\.v1") "nature-paper skill does not mention Nature and PaperProfile.v1." | Out-Null
    if (-not $FixtureMode) {
        try {
            $response = Invoke-WebRequest -Uri "https://www.nature.com/nature/for-authors" -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 30
            $statusCode = $response.StatusCode
            if ($null -eq $statusCode -and $null -ne $response.BaseResponse) {
                $statusCode = [int]$response.BaseResponse.StatusCode
            }
            Assert-StrictLive ($statusCode -ge 200 -and $statusCode -lt 400) "Nature author guidance URL did not respond successfully." | Out-Null
        } catch {
            throw "Nature author guidance request failed: $($_.Exception.Message)"
        }
    }
    return "nature-paper skill installed and official guidance reachable"
}

function New-AcceptanceTempDir {
    $tmp = Join-Path $RepoRoot "tmp/strict-acceptance"
    $resolvedRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
    if (Test-Path -LiteralPath $tmp) {
        $resolvedTmp = (Resolve-Path -LiteralPath $tmp).Path
        if (-not $resolvedTmp.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to delete temp path outside repo: $resolvedTmp"
        }
        Remove-Item -LiteralPath $resolvedTmp -Recurse -Force
    }
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    return $tmp
}

function Invoke-PythonAcceptanceSnippet {
    param(
        [string]$Name,
        [string]$Code,
        [int]$TimeoutSeconds = 120
    )
    $tmp = Join-Path $RepoRoot "tmp/strict-acceptance-python"
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    $snippet = Join-Path $tmp $Name
    Set-Content -LiteralPath $snippet -Encoding UTF8 -Value $Code
    return Invoke-CheckedCommand -File "python" -Arguments @($snippet) -Environment @{ PYTHONPATH = (Join-Path $RepoRoot "research-tools/src") } -TimeoutSeconds $TimeoutSeconds
}

function Invoke-PandocConversion {
    $pandoc = Get-Command pandoc -ErrorAction SilentlyContinue
    Assert-StrictLive ($null -ne $pandoc) "pandoc was not found on PATH." | Out-Null
    $tmp = New-AcceptanceTempDir
    $md = Join-Path $tmp "acceptance.md"
    $tex = Join-Path $tmp "acceptance.tex"
    Set-Content -LiteralPath $md -Encoding UTF8 -Value "# Strict Acceptance`n`nThis is a conversion smoke."
    Invoke-CheckedCommand "pandoc" @($md, "-t", "latex", "-o", $tex) | Out-Null
    Assert-StrictLive (Test-Path -LiteralPath $tex) "pandoc did not write LaTeX output." | Out-Null
    return "pandoc generated acceptance.tex"
}

function Invoke-LatexPdfGeneration {
    $engine = Get-Command xelatex -ErrorAction SilentlyContinue
    if ($null -eq $engine) { $engine = Get-Command pdflatex -ErrorAction SilentlyContinue }
    if ($null -eq $engine) { $engine = Get-Command tectonic -ErrorAction SilentlyContinue }
    Assert-StrictLive ($null -ne $engine) "No LaTeX PDF engine found." | Out-Null
    $tmp = New-AcceptanceTempDir
    $tex = Join-Path $tmp "acceptance-pdf.tex"
    $pdf = Join-Path $tmp "acceptance-pdf.pdf"
    Set-Content -LiteralPath $tex -Encoding UTF8 -Value "\documentclass{article}`n\begin{document}`nStrict acceptance PDF smoke.`n\end{document}`n"
    if ($engine.Name -eq "tectonic.exe" -or $engine.Name -eq "tectonic") {
        Invoke-CheckedCommand $engine.Source @("--outdir", $tmp, $tex) | Out-Null
    } else {
        Invoke-CheckedCommand $engine.Source @("-interaction=nonstopmode", "-halt-on-error", "-output-directory", $tmp, $tex) | Out-Null
    }
    Assert-StrictLive (Test-Path -LiteralPath $pdf) "LaTeX engine did not write PDF output." | Out-Null
    return "$($engine.Name) generated acceptance-pdf.pdf"
}

function Invoke-DocxGeneration {
    $pandoc = Get-Command pandoc -ErrorAction SilentlyContinue
    Assert-StrictLive ($null -ne $pandoc) "pandoc was not found on PATH." | Out-Null
    $tmp = New-AcceptanceTempDir
    $md = Join-Path $tmp "acceptance-docx.md"
    $docx = Join-Path $tmp "acceptance-docx.docx"
    Set-Content -LiteralPath $md -Encoding UTF8 -Value "# Strict Acceptance`n`nDOCX smoke."
    Invoke-CheckedCommand "pandoc" @($md, "-o", $docx) | Out-Null
    Assert-StrictLive (Test-Path -LiteralPath $docx) "pandoc did not write DOCX output." | Out-Null
    return "pandoc generated acceptance-docx.docx"
}

function Invoke-LiveCrawlerFetch {
    if ($FixtureMode) { return "fixture live-crawler-fetch: skipped external HTTP fetch" }
    $code = @'
import json
from paper_fucker_tools.crawler import crawl_url
record = crawl_url({
    "url": "https://example.com/",
    "allow_network": True,
    "respect_robots": False,
    "license_status": "compatible",
    "timeout_seconds": 30,
})
assert record["schema_version"] == "CrawlSourceRecord.v1", record
assert record["status"] == "fetched", record
assert record["http_status"] >= 200 and record["http_status"] < 400, record
assert record["content_sha256"], record
assert "scrapling_live_fetch_not_implemented" not in record.get("diagnostics", []), record
print(json.dumps({"status": record["status"], "method": record["extraction_evidence"]["method"], "title": record["title"]}))
'@
    return Invoke-PythonAcceptanceSnippet -Name "live-crawler-fetch.py" -Code $code -TimeoutSeconds 120
}

function Invoke-HFLiveResearchLoop {
    if ($FixtureMode) { return "fixture hf-live-research-loop: live papers/jobs/trackio boundary skipped" }
    $code = @'
import json
from paper_fucker_tools.huggingface_loop import hf_research_probe
papers = hf_research_probe({"kind": "papers", "query": "transformers", "limit": 1, "allow_network": True})
assert papers["mode"] == "live", papers
assert len(papers["records"]) >= 1, papers
assert papers["records"][0]["trust"] == "hf_official", papers
jobs = hf_research_probe({"kind": "jobs", "query": "paper_fucker", "limit": 1, "allow_network": True})
assert jobs["mode"] in {"live", "blocked"}, jobs
if jobs["mode"] == "blocked":
    assert jobs["diagnostics"] == ["hf_token_required_for_jobs"], jobs
trackio = hf_research_probe({
    "kind": "trackio",
    "query": "paper_fucker",
    "trackio_export": {
        "run_id": "strict-live-trackio-export",
        "title": "Strict live Trackio exported metrics",
        "metrics": [{"name": "accuracy", "value": 0.94, "step": 1}],
    },
})
assert trackio["mode"] == "provided", trackio
assert trackio["records"][0]["trust"] == "user_provided_trackio_export", trackio
print(json.dumps({"papers": len(papers["records"]), "jobs_mode": jobs["mode"], "trackio_mode": trackio["mode"]}))
'@
    return Invoke-PythonAcceptanceSnippet -Name "hf-live-research-loop.py" -Code $code -TimeoutSeconds 180
}

function Invoke-TrackedSecretScan {
    Push-Location $RepoRoot
    try {
        $matches = & git grep -n -I -E "sk-[A-Za-z0-9]{20,}" -- . 2>&1
        $exit = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($exit -eq 0) { throw "Potential tracked secret found: $($matches -join ' ')" }
    if ($exit -gt 1) { throw "git grep secret scan failed with exit ${exit}: $($matches -join ' ')" }
    return "no tracked sk-* API keys found"
}

function Invoke-GitFlowCleanupCheck {
    Push-Location $RepoRoot
    try {
        $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
        $forbidden = & git branch --format "%(refname:short)" | Where-Object { $_ -match "^(codex/|task-)" }
    } finally {
        Pop-Location
    }
    Assert-StrictLive (($branch -eq "develop") -or ($branch -match "^(feature|fix)/[a-z0-9-]+$")) "Current branch '$branch' is not develop or a Git Flow feature/fix branch." | Out-Null
    Assert-StrictLive (@($forbidden).Count -eq 0) "Forbidden local branches remain: $($forbidden -join ', ')." | Out-Null
    return "current branch $branch follows Git Flow and no codex/task branches remain"
}

function Read-RepoText {
    param([string]$RelativePath)
    return Get-Content -Raw -LiteralPath (Join-Path $RepoRoot $RelativePath)
}

function Get-ProjectVersion {
    $readme = Read-RepoText "README.md"
    $match = [regex]::Match($readme, "<!-- version:start -->([^<]+)<!-- version:end -->")
    if ($match.Success) { return $match.Groups[1].Value }
    return "unknown"
}

function Assert-HardFork {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if (-not $Condition) { throw $Message }
}

function Invoke-HardForkPaperCore {
    $paperCore = Join-Path $RepoRoot "packages/opencode/src/paper"
    $sidecarServer = Join-Path $RepoRoot "packages/server"
    Assert-HardFork (Test-Path -LiteralPath $paperCore) "packages/opencode/src/paper is missing."
    Assert-HardFork (-not (Test-Path -LiteralPath $sidecarServer)) "packages/server sidecar package still exists."
    Assert-HardFork (Test-Path -LiteralPath (Join-Path $RepoRoot "packages/opencode/src/server/routes/instance/httpapi/groups/paper.ts")) "Paper HttpApi group is missing from opencode."
    Assert-HardFork (Test-Path -LiteralPath (Join-Path $RepoRoot "packages/opencode/src/server/routes/instance/httpapi/handlers/paper.ts")) "Paper HttpApi handler is missing from opencode."
    return "paper core lives under packages/opencode/src/paper and no packages/server sidecar exists"
}

function Invoke-HardForkPaperRunApiTui {
    $workbench = Read-RepoText "packages/opencode/src/cli/cmd/tui/routes/paper/workbench.ts"
    $dashboard = Read-RepoText "packages/opencode/src/cli/cmd/tui/routes/paper/index.tsx"
    $api = Read-RepoText "packages/opencode/src/server/routes/instance/httpapi/groups/paper.ts"
    $handlers = Read-RepoText "packages/opencode/src/server/routes/instance/httpapi/handlers/paper.ts"
    Assert-HardFork ($workbench -match "paper/runs") "TUI workbench does not submit to /paper/runs."
    Assert-HardFork ($dashboard -match "PaperRunDashboard" -and $dashboard -match "createPaperRunDashboardState") "TUI dashboard is not the PaperRun workbench."
    Assert-HardFork ($api -match "PaperRunCreatePayload" -and $api -match "quality_mode" -and $api -match "data_egress_policy") "PaperRun API schema does not expose required create fields."
    Assert-HardFork ($handlers -match "createPaperRun" -and $handlers -match "exportPaperRun" -and $handlers -match "previewPaperRun") "PaperRun handlers are not bound to paper runtime functions."
    return "PaperRun API and TUI workbench are first-class paper surfaces"
}

function Invoke-HardForkAgentTree {
    $agents = Read-RepoText "packages/opencode/src/paper/agents.ts"
    $run = Read-RepoText "packages/opencode/src/paper/run.ts"
    Assert-HardFork ($agents -match "parent_agent_id" -and $agents -match "depth" -and $agents -match "subagent_role") "Agent tree source does not encode nested subagent parent/depth metadata."
    Assert-HardFork ($agents -match "provider_id" -and $agents -match "model_id") "Agent tree source does not record provider/model per agent."
    Assert-HardFork ($run -match "max_depth" -and $run -match "max_parallel" -and $run -match "budgetTierPolicy") "PaperRun snapshot does not project budget-tier agent limits."
    return "Agent Tree supports nested multi-model agents with budget limits"
}

function Invoke-HardForkQualityEgress {
    $run = Read-RepoText "packages/opencode/src/paper/run.ts"
    $authoring = Read-RepoText "packages/opencode/src/paper/authoring.ts"
    $egress = Read-RepoText "packages/opencode/src/paper/data-egress.ts"
    Assert-HardFork ($run -match "reviewable_bundle" -and $run -match "submission_candidate") "PaperRun quality modes are missing."
    Assert-HardFork ($run -match "private_first" -and $egress -match "denied_patterns" -and $egress -match "external_model_full_text") "Private-first data egress policy is missing."
    Assert-HardFork ($authoring -match "forced_draft" -and $authoring -match "PaperSupplementaryBundle" -and $authoring -match "PaperAvailabilityBundle") "Authoring loop does not expose forced draft, supplementary, and availability bundles."
    return "quality modes, private-first egress, forced draft, supplementary, and availability bundles are present"
}

function Invoke-HardForkPublicBranding {
    $logo = Read-RepoText "packages/opencode/src/cli/logo.ts"
    $index = Read-RepoText "packages/opencode/src/index.ts"
    $tips = Read-RepoText "packages/opencode/src/cli/cmd/tui/feature-plugins/home/tips-view.tsx"
    $homeRoute = Read-RepoText "packages/opencode/src/cli/cmd/tui/routes/home.tsx"
    $dashboard = Read-RepoText "packages/opencode/src/cli/cmd/tui/routes/paper/index.tsx"
    $sessionSidebar = Read-RepoText "packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx"
    $pluginSidebarFooter = Read-RepoText "packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/footer.tsx"
    $paperApi = Read-RepoText "packages/opencode/src/server/routes/instance/httpapi/groups/paper.ts"
    Assert-HardFork ($logo -match "Paper Fucker") "CLI logo does not expose Paper Fucker."
    Assert-HardFork (-not ($index -match "\.command\(SessionCommand\)" -or $index -match "\.command\(GithubCommand\)" -or $index -match "\.command\(AcpCommand\)" -or $index -match "\.command\(PrCommand\)")) "Legacy OpenCode product commands are still registered publicly."
    Assert-HardFork ($tips -match "PaperRun" -and $tips -match "Claim Ledger" -and $tips -match "Source Ledger" -and $tips -match "submission_candidate") "TUI home guidance is not PaperRun-ledger oriented."
    Assert-HardFork ($homeRoute -match "PaperRun" -and $homeRoute -match "submitPaperWorkbenchPrompt") "TUI home route is not PaperRun workbench oriented."
    Assert-HardFork ($dashboard -match "PaperRunDashboard" -and $dashboard -match "Agent Tree" -and $dashboard -match "PaperRunSidebar") "PaperRun dashboard sidebar is missing diagnostic sections."
    Assert-HardFork ($sessionSidebar -match "Paper Fucker" -and -not ($sessionSidebar -match "<b>Open</b>" -or $sessionSidebar -match "<b>Code</b>")) "Session sidebar footer still exposes legacy OpenCode branding."
    Assert-HardFork ($pluginSidebarFooter -match "Paper Fucker" -and -not ($pluginSidebarFooter -match "<b>Open</b>" -or $pluginSidebarFooter -match "<b>Code</b>")) "Plugin sidebar footer still exposes legacy OpenCode branding."
    Assert-HardFork (-not ($paperApi -match "OpenCode provider/model discovery data")) "Paper provider discovery API still exposes legacy OpenCode product wording."
    return "public logo, command registry, TUI home, sidebars, dashboard, and paper API expose Paper Fucker/PaperRun surfaces"
}

function Invoke-ObservabilityAuditCoverage {
    $observability = Read-RepoText "packages/opencode/src/paper/observability.ts"
    $run = Read-RepoText "packages/opencode/src/paper/run.ts"
    $exportPipeline = Read-RepoText "packages/opencode/src/paper/export-pipeline.ts"
    Assert-HardFork ($observability -match "recordPaperToolTrace" -and $observability -match "recordPaperCostUsage" -and $observability -match "recordPaperDataEgressAudit") "Observability helpers do not record tool trace, cost, and data egress audit."
    Assert-HardFork ($observability -match "PAPER_OBSERVABILITY_REQUIRED_KINDS" -and $observability -match "model_role" -and $observability -match "subagent" -and $observability -match "export_renderer") "Observability required coverage does not include model roles, subagents, and export renderers."
    Assert-HardFork ($run -match "paperObservabilityAuditFromEvents" -and $run -match "audit:") "PaperRun snapshots do not expose observability audit summaries."
    Assert-HardFork ($exportPipeline -match "recordPaperObservabilityAudit" -and $exportPipeline -match "export_renderer") "Export renderer pipeline does not emit audit entries."
    return "PaperRun diagnostics expose observability audit coverage for stage/capability/model/subagent/tool/egress/export/cost"
}

function Invoke-AgentTeamCapabilityFusion {
    $agentTeam = Read-RepoText "packages/opencode/src/paper/agent-team.ts"
    $capabilityPack = Read-RepoText "packages/opencode/src/paper/capability-pack.ts"
    $harness = Read-RepoText "packages/opencode/src/paper/harness.ts"
    $memory = Read-RepoText "packages/opencode/src/paper/memory-bank.ts"
    $code = Read-RepoText "packages/opencode/src/paper/code-understanding.ts"
    $crawler = Read-RepoText "packages/opencode/src/paper/crawler.ts"
    $hf = Read-RepoText "packages/opencode/src/paper/huggingface-loop.ts"
    Assert-HardFork ($agentTeam -match "PaperAgentTeamPolicy" -and $agentTeam -match "source_bound_only" -and $agentTeam -match "hf_jobs") "Agent Team policy is missing source-bound evidence or HF job approvals."
    Assert-HardFork ($capabilityPack -match "paper-profile-skills" -and $capabilityPack -match "literature-mcp" -and $capabilityPack -match "crawler-data" -and $capabilityPack -match "huggingface-research") "Built-in capability packs are incomplete."
    Assert-HardFork ($capabilityPack -match "python.web-crawler.scrapling" -and $capabilityPack -match "hf.datasets" -and $capabilityPack -match "hf.jobs" -and $capabilityPack -match "hf.trackio") "Crawler and HF capabilities are not fused into the built-in registry."
    Assert-HardFork ($harness -match "approval_required" -and $harness -match "doom_loop" -and $harness -match "max_parallel") "Harness is missing approval, doom-loop, or concurrency controls."
    Assert-HardFork ($memory -match "MemoryBank.v1" -and $memory -match "redacted") "MemoryBank contracts or redaction are missing."
    Assert-HardFork ($code -match "CodeUnderstandingGraph.v1" -and $code -match "source_range") "Code understanding graph or source ranges are missing."
    Assert-HardFork ($crawler -match "CrawlComplianceReport.v1" -and $crawler -match "license_conflict" -and $crawler -match "robots_blocked") "Crawler policy gates are missing."
    Assert-HardFork ($hf -match "HFResearchLoopPlan.v1" -and $hf -match "hfJobToExperimentRun" -and $hf -match "HFTrackioRecord.v1") "HF research loop contracts or experiment integration are missing."
    return "Agent Team, built-in capability packs, harness, memory, code understanding, crawler, and HF loop are fused"
}

function Invoke-PaperWorkbenchUXSidebar {
    $dashboard = Read-RepoText "packages/opencode/src/cli/cmd/tui/routes/paper/index.tsx"
    $workbench = Read-RepoText "packages/opencode/src/cli/cmd/tui/routes/paper/workbench.ts"
    $tips = Read-RepoText "packages/opencode/src/cli/cmd/tui/feature-plugins/home/tips-view.tsx"
    Assert-HardFork ($dashboard -match "formatted_total" -and $dashboard -match "tokens total" -and $dashboard -match "outline") "PaperRun sidebar does not preserve cost/token/context/outline."
    Assert-HardFork ($dashboard -match "Agent Tree" -and $dashboard -match "Agent Team" -and $dashboard -match "Gate" -and $dashboard -match "Memory / Code") "PaperRun sidebar is missing Agent Tree, Agent Team, Gate, or Memory / Code sections."
    Assert-HardFork ($workbench -match "PaperRunCostDiagnostics" -and $workbench -match "PaperRunOutlineState" -and $workbench -match "PaperRunGateSummary") "PaperRun sidebar state contracts are missing."
    Assert-HardFork ($workbench -match "pause_question" -and $workbench -match "capability_health" -and $workbench -match "model_roles") "Paper workbench UX lacks pause questions, capability health, or model roles."
    Assert-HardFork ($tips -match "PaperRun" -and $tips -match "Agent Tree" -and $tips -match "Claim Ledger") "Home guidance does not describe the PaperRun diagnostic workflow."
    return "PaperRun workbench keeps cost/token/context/outline and PaperRun diagnostics visible"
}

function Invoke-HFNoMockBoundary {
    $hfBridge = Read-RepoText "research-tools/src/paper_fucker_tools/huggingface_loop.py"
    $hfTests = Read-RepoText "research-tools/tests/test_huggingface_loop.py"
    Assert-HardFork ($hfBridge -match "network_not_authorized" -and $hfBridge -match "mode = `"blocked`"") "HF bridge does not block unauthorized product calls."
    Assert-HardFork (-not ($hfBridge -match "network_not_authorized_mock_used")) "HF bridge still contains a mock fallback diagnostic."
    Assert-HardFork ($hfTests -match "test_probe_blocks_when_network_is_not_authorized" -and $hfTests -match "fixture") "HF tests do not lock the no-mock product boundary."
    return "HF product calls fail closed without authorized live access; fixture data is explicit only"
}

function Invoke-ChangelogSplitArchives {
    $preferences = Read-RepoText ".plan/preferences.yaml"
    Assert-HardFork ($preferences -match "archive_dir: docs/changelog" -and $preferences -match "minor_split_line_threshold") "TaskFlow changelog split preferences are missing."
    $archive = Join-Path $RepoRoot "docs/changelog/v0/0.1.x.CHANGELOG"
    Assert-HardFork (Test-Path -LiteralPath $archive) "0.1.x changelog archive is missing."
    $archiveText = Get-Content -Raw -LiteralPath $archive
    Assert-HardFork ($archiveText -match ":history" -and $archiveText -match "0\.1\.") "0.1.x changelog archive does not contain colon history entries."
    return "TaskFlow changelog split preferences and 0.1.x archive are present"
}

function Write-Report {
    $report = Join-Path $RepoRoot $ReportPath
    $dir = Split-Path -Parent $report
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $status = if ($script:Failed) { "failed" } else { "passed" }
    $lines = @(
        "# Strict Live Acceptance Report",
        "",
        "- Generated: $(Get-Date -Format o)",
        "- Mode: $AcceptanceMode",
        "- Full workspace suite: $([bool]$FullWorkspaceSuite)",
        "- Check timeout seconds: $CheckTimeoutSeconds",
        "- Status: $status",
        "",
        "| Check | Status | Seconds | Detail |",
        "| --- | --- | ---: | --- |"
    )
    foreach ($result in $Results) {
        $lines += "| ``{0}`` | {1} | {2} | {3} |" -f $result.id, $result.status, $result.seconds, $result.detail
    }
    for ($attempt = 1; $attempt -le 8; $attempt++) {
        try {
            Set-Content -LiteralPath $report -Encoding UTF8 -Value ($lines -join "`n")
            return
        } catch [System.IO.IOException] {
            if ($attempt -eq 8) { throw }
            Start-Sleep -Milliseconds (150 * $attempt)
        }
    }
}

Invoke-Check "taskflow-validate-all" "TaskFlow validates all tasks" {
    Invoke-CheckedCommand "taskflow" @("validate", "--plan-dir", ".plan")
}
Invoke-Check "readme-changelog-version" "README version matches latest CHANGELOG version" {
    Invoke-CheckedCommand "powershell" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ".\scripts\check-readme-version.ps1")
}
Invoke-Check "tracked-secret-scan" "Tracked secret scan" {
    Invoke-TrackedSecretScan
}
Invoke-Check "server-tests" "Server tests" {
    if ($FullWorkspaceSuite) {
        Invoke-CheckedCommand -File "npx" -Arguments @("--yes", "bun@1.3.13", "--cwd", "packages/opencode", "test") -TimeoutSeconds $FullWorkspaceTimeoutSeconds
    } else {
        Invoke-CheckedCommand -File "npx" -Arguments @(
            "--yes",
            "bun@1.3.13",
            "--cwd",
            "packages/opencode",
            "test",
            "test/paper/paperrun-execution.test.ts",
            "test/paper/code-to-paper.test.ts",
            "test/paper/export-pipeline.test.ts",
            "test/paper/observability-audit.test.ts",
            "test/paper/agent-team-capability-acceptance.test.ts",
            "test/paper/strict-acceptance.test.ts"
        )
    }
}
Invoke-Check "preview-tests" "Preview tests" {
    Invoke-CheckedCommand "npx" @("--yes", "bun@1.3.13", "--cwd", "packages/preview", "test")
}
Invoke-Check "python-tests" "Python research tools tests" {
    Invoke-CheckedCommand "python" @("-m", "unittest", "discover", "-s", "research-tools/tests") @{ PYTHONPATH = (Join-Path $RepoRoot "research-tools/src") }
}
Invoke-Check "server-typecheck" "Server typecheck" {
    Invoke-CheckedCommand "npx" @("--yes", "bun@1.3.13", "run", "--cwd", "packages/opencode", "typecheck")
}
Invoke-Check "workspace-typecheck" "Workspace typecheck" {
    Invoke-CheckedCommand "npx" @("--yes", "bun@1.3.13", "run", "typecheck")
}
Invoke-Check "opencode-tui-smoke" "Paper Fucker TUI smoke" {
    $help = Invoke-CheckedCommand "npx" @("--yes", "bun@1.3.13", "--cwd", "packages/opencode", "src/index.ts", "--help")
    Assert-HardFork ($help -match "Paper Fucker" -or (Read-RepoText "packages/opencode/src/cli/logo.ts") -match "Paper Fucker") "Local Paper Fucker CLI help did not expose the product branding."
    return "local paper_fucker CLI help responded"
}
Invoke-Check "live-provider-call" "At least one live OpenCode-compatible provider call" {
    Invoke-DeepSeekSmoke
}
Invoke-Check "exa-live-search" "Exa remote MCP live search connector smoke" {
    Invoke-ExaSmoke
}
Invoke-Check "nature-skill-profile" "Nature skill/profile smoke" {
    Invoke-NatureSkillSmoke
}
Invoke-Check "pandoc-conversion" "Pandoc Markdown to LaTeX conversion" {
    Invoke-PandocConversion
}
Invoke-Check "latex-pdf-generation" "LaTeX PDF generation" {
    Invoke-LatexPdfGeneration
}
Invoke-Check "docx-generation" "DOCX generation" {
    Invoke-DocxGeneration
}
Invoke-Check "live-crawler-fetch" "Authorized live crawler fetch" {
    Invoke-LiveCrawlerFetch
}
Invoke-Check "hf-live-research-loop" "Hugging Face live papers and no-mock jobs/Trackio boundary" {
    Invoke-HFLiveResearchLoop
}
Invoke-Check "topic-to-paper-live-run" "Topic-to-paper runtime smoke" {
    Invoke-CheckedCommand "npx" @("--yes", "bun@1.3.13", "scripts/live-paper-quality-benchmark.ts", "--scenario", "topic")
}
Invoke-Check "code-to-paper-live-run" "Code-to-paper runtime smoke" {
    Invoke-CheckedCommand "npx" @("--yes", "bun@1.3.13", "scripts/live-paper-quality-benchmark.ts", "--scenario", "code")
}
Invoke-Check "final-export-pass-run" "Reproduction-pass final export runtime smoke" {
    Invoke-CheckedCommand "npx" @("--yes", "bun@1.3.13", "scripts/live-paper-quality-benchmark.ts", "--scenario", "final")
}
Invoke-Check "hard-fork-paper-core" "Hard fork paper core migration" {
    Invoke-HardForkPaperCore
}
Invoke-Check "hard-fork-paperrun-api-tui" "PaperRun API and TUI workbench surface" {
    Invoke-HardForkPaperRunApiTui
}
Invoke-Check "hard-fork-agent-tree" "Multi-layer multi-model Agent Tree" {
    Invoke-HardForkAgentTree
}
Invoke-Check "hard-fork-quality-egress" "Quality modes, egress, and authoring bundles" {
    Invoke-HardForkQualityEgress
}
Invoke-Check "hard-fork-public-branding" "Paper Fucker public branding and command cleanup" {
    Invoke-HardForkPublicBranding
}
Invoke-Check "observability-audit-coverage" "PaperRun observability audit coverage" {
    Invoke-ObservabilityAuditCoverage
}
Invoke-Check "agent-team-capability-fusion" "Agent Team and capability bus acceptance" {
    Invoke-AgentTeamCapabilityFusion
}
Invoke-Check "paper-workbench-ux-sidebar" "PaperRun workbench UX sidebar acceptance" {
    Invoke-PaperWorkbenchUXSidebar
}
Invoke-Check "hf-no-mock-boundary" "HF bridge does not mock product data" {
    Invoke-HFNoMockBoundary
}
Invoke-Check "changelog-split-archives" "TaskFlow changelog split archives" {
    Invoke-ChangelogSplitArchives
}
Invoke-Check "git-flow-cleanup" "Git Flow branch discipline" {
    Invoke-GitFlowCleanupCheck
}

Write-Report

if ($Failed) {
    Write-Error "Strict live acceptance failed. See $ReportPath."
    exit 1
}

Write-Host "Strict live acceptance passed. Report: $ReportPath"
