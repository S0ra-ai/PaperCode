param(
    [switch]$FixtureMode,
    [string]$ReportPath = "reports/strict-live-acceptance.md"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Results = New-Object "System.Collections.Generic.List[object]"
$Failed = $false

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
    "topic-to-paper-live-run",
    "code-to-paper-live-run",
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
    if ($text.Length -gt 500) { return $text.Substring(0, 500) + "..." }
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
        [hashtable]$Environment = @{}
    )
    $previous = @{}
    foreach ($key in $Environment.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
        [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], "Process")
    }
    try {
        Push-Location $RepoRoot
        try {
            $previousErrorPreference = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            try {
                $output = & $File @Arguments 2>&1
                $exit = $LASTEXITCODE
            } finally {
                $ErrorActionPreference = $previousErrorPreference
            }
        } finally {
            Pop-Location
        }
        if ($exit -ne 0) {
            throw "$File $($Arguments -join ' ') failed with exit $exit. $($output -join ' ')"
        }
        return ($output | Select-Object -Last 12) -join " "
    } finally {
        foreach ($key in $Environment.Keys) {
            [Environment]::SetEnvironmentVariable($key, $previous[$key], "Process")
        }
    }
}

function Invoke-Check {
    param(
        [string]$Id,
        [string]$Title,
        [scriptblock]$Body
    )
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $detail = & $Body
        $timer.Stop()
        Add-Result $Id $Title "pass" $detail $timer.Elapsed.TotalSeconds
    } catch {
        $timer.Stop()
        $script:Failed = $true
        Add-Result $Id $Title "fail" $_.Exception.Message $timer.Elapsed.TotalSeconds
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
        messages = @(@{ role = "user"; content = "只回复 OK" })
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
            clientInfo = @{ name = "paper_fucker_acceptance"; version = "0.2.0-dev" }
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
    Assert-StrictLive (($branch -eq "develop") -or ($branch -match "^feature/[a-z0-9-]+$")) "Current branch '$branch' is not develop or a Git Flow feature branch." | Out-Null
    Assert-StrictLive (@($forbidden).Count -eq 0) "Forbidden local branches remain: $($forbidden -join ', ')." | Out-Null
    return "current branch $branch follows Git Flow and no codex/task branches remain"
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
        "- Mode: $(if ($FixtureMode) { "fixture" } else { "strict-live" })",
        "- Status: $status",
        "",
        "| Check | Status | Seconds | Detail |",
        "| --- | --- | ---: | --- |"
    )
    foreach ($result in $Results) {
        $lines += "| ``{0}`` | {1} | {2} | {3} |" -f $result.id, $result.status, $result.seconds, $result.detail
    }
    Set-Content -LiteralPath $report -Encoding UTF8 -Value ($lines -join "`n")
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
    Invoke-CheckedCommand "npx" @("--yes", "bun@1.3.13", "--cwd", "packages/server", "test")
}
Invoke-Check "preview-tests" "Preview tests" {
    Invoke-CheckedCommand "npx" @("--yes", "bun@1.3.13", "--cwd", "packages/preview", "test")
}
Invoke-Check "python-tests" "Python research tools tests" {
    Invoke-CheckedCommand "python" @("-m", "unittest", "discover", "-s", "research-tools/tests") @{ PYTHONPATH = (Join-Path $RepoRoot "research-tools/src") }
}
Invoke-Check "server-typecheck" "Server typecheck" {
    Invoke-CheckedCommand "npx" @("--yes", "bun@1.3.13", "run", "--cwd", "packages/server", "typecheck")
}
Invoke-Check "workspace-typecheck" "Workspace typecheck" {
    Invoke-CheckedCommand "npx" @("--yes", "bun@1.3.13", "run", "typecheck")
}
Invoke-Check "opencode-tui-smoke" "OpenCode TUI smoke" {
    Invoke-CheckedCommand "opencode" @("--version")
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
Invoke-Check "topic-to-paper-live-run" "Topic-to-paper runtime smoke" {
    Invoke-CheckedCommand "npx" @("--yes", "bun@1.3.13", "--cwd", "packages/server", "test", "test/research/e2e.test.ts")
}
Invoke-Check "code-to-paper-live-run" "Code-to-paper runtime smoke" {
    Invoke-CheckedCommand "npx" @("--yes", "bun@1.3.13", "--cwd", "packages/server", "test", "test/paper/code-to-paper.test.ts")
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
