param(
    [switch]$AllowActiveTask,
    [string]$ReportPath = "reports/autonomous-product-audit.md"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Results = New-Object "System.Collections.Generic.List[object]"
$Failed = $false

function Add-AuditResult {
    param(
        [string]$Id,
        [string]$Status,
        [string]$Detail
    )
    if ($Status -eq "fail") { $script:Failed = $true }
    $Results.Add([pscustomobject]@{
        id = $Id
        status = $Status
        detail = (($Detail -replace "\r?\n", " ") -replace "\|", "/")
    }) | Out-Null
}

function Read-RepoText {
    param([string]$RelativePath)
    return Get-Content -Raw -LiteralPath (Join-Path $RepoRoot $RelativePath)
}

function Get-IndexNumber {
    param(
        [string]$Text,
        [string]$Key
    )
    $match = [regex]::Match($Text, "(?m)^\s*${Key}:\s*(\d+)\s*`$")
    if (-not $match.Success) { throw "Could not read .plan index key: $Key" }
    return [int]$match.Groups[1].Value
}

function Invoke-RepoCommand {
    param(
        [string]$File,
        [string[]]$Arguments
    )
    Push-Location $RepoRoot
    try {
        $output = & $File @Arguments 2>&1
        $exit = $LASTEXITCODE
        if ($null -eq $exit) { $exit = 0 }
        return [pscustomobject]@{
            exit = [int]$exit
            output = @($output | ForEach-Object { [string]$_ })
        }
    } finally {
        Pop-Location
    }
}

function Test-TaskFlowQueue {
    $index = Read-RepoText ".plan/index.yaml"
    $confirmed = Get-IndexNumber $index "confirmed"
    $ideas = Get-IndexNumber $index "ideas"
    $inProgress = Get-IndexNumber $index "in_progress"
    $done = Get-IndexNumber $index "done"
    if ($confirmed -eq 0 -and $ideas -eq 0 -and $inProgress -eq 0) {
        Add-AuditResult "taskflow-queue" "pass" "TaskFlow queue is empty; done=$done."
        return
    }
    if ($AllowActiveTask -and $ideas -eq 0 -and $confirmed -le 1 -and $inProgress -le 1) {
        Add-AuditResult "taskflow-queue" "pass" "Active audit task allowed; confirmed=$confirmed in_progress=$inProgress done=$done."
        return
    }
    Add-AuditResult "taskflow-queue" "fail" "TaskFlow still has unfinished work; confirmed=$confirmed ideas=$ideas in_progress=$inProgress done=$done."
}

function Test-VersionSync {
    $result = Invoke-RepoCommand "powershell" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ".\scripts\check-readme-version.ps1")
    if ($result.exit -eq 0) {
        Add-AuditResult "version-sync" "pass" (($result.output | Select-Object -Last 1) -join " ")
    } else {
        Add-AuditResult "version-sync" "fail" ($result.output -join " ")
    }
}

function Test-ChangelogShape {
    $text = Read-RepoText "CHANGELOG"
    $hasHeader = $text.Contains(":project") -and $text.Contains(":history")
    $versionMatch = [regex]::Match($text, '(?m)^:version\s+([0-9]+(?:\.[0-9]+){2,3}-dev)\s*$')
    $entryMatches = [regex]::Matches(
        $text,
        '(?m)^\s{4}([0-9]+(?:\.[0-9]+){2,3}-dev)\s+-\s+\d{4}/\d{2}/\d{2}\s+\(([0-9a-f]{7,40})\)\s+\[(develop|feature/[^\]]+|fix/[^\]]+)\]\s*$'
    )
    $badMarkdown = $text -match '(?m)^#{1,6}\s'
    if (
        $hasHeader -and
        $versionMatch.Success -and
        $entryMatches.Count -eq 1 -and
        $entryMatches[0].Groups[1].Value -eq $versionMatch.Groups[1].Value -and
        -not $badMarkdown
    ) {
        Add-AuditResult "changelog-shape" "pass" "CHANGELOG keeps one active colon DSL entry with matching :version, Git Flow branch, and real commit id."
    } else {
        Add-AuditResult "changelog-shape" "fail" "CHANGELOG colon DSL shape check failed: header=$hasHeader version=$($versionMatch.Success) active_entries=$($entryMatches.Count) markdown=$badMarkdown."
    }
}

function Test-DevelopmentDocs {
    $result = Invoke-RepoCommand "powershell" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ".\scripts\check-development-docs.ps1", "-Render")
    if ($result.exit -eq 0) {
        Add-AuditResult "development-docs" "pass" (($result.output | Select-Object -Last 1) -join " ")
    } else {
        Add-AuditResult "development-docs" "fail" ($result.output -join " ")
    }
}

function Test-StrictEvidence {
    $report = Read-RepoText "reports/strict-live-acceptance.md"
    $changelog = Read-RepoText "CHANGELOG"
    $versionMatch = [regex]::Match($changelog, '(?m)^:version\s+([0-9]+(?:\.[0-9]+){2,3}-dev)\s*$')
    if (-not $versionMatch.Success) {
        Add-AuditResult "strict-live-evidence" "fail" "CHANGELOG :version is missing; strict live evidence cannot be matched to current build."
        return
    }
    $currentVersion = $versionMatch.Groups[1].Value
    $required = @(
        "- Status: passed",
        "- Mode: strict-live-focused",
        "live-crawler-fetch",
        "hf-live-research-loop",
        "topic-to-paper-live-run",
        "code-to-paper-live-run",
        "final-export-pass-run",
        '"final_export": "final"'
    )
    $missing = @($required | Where-Object { -not $report.Contains($_) })
    $versionMatches = @([regex]::Matches($report, '"project_version":\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    $staleVersions = @($versionMatches | Where-Object { $_ -ne $currentVersion })
    if ($missing.Count -eq 0 -and $versionMatches.Count -gt 0 -and $staleVersions.Count -eq 0) {
        Add-AuditResult "strict-live-evidence" "pass" "Latest strict live report proves focused live crawler, HF, topic/code, and final export pass scenarios for $currentVersion."
    } else {
        $details = @()
        if ($missing.Count -gt 0) { $details += "missing=$($missing -join ', ')" }
        if ($versionMatches.Count -eq 0) { $details += "project_version entries missing" }
        if ($staleVersions.Count -gt 0) { $details += "stale_project_version=$($staleVersions -join ', ') current=$currentVersion" }
        Add-AuditResult "strict-live-evidence" "fail" "Strict report is not current: $($details -join '; ')"
    }
}

function Test-FullWorkspaceEvidence {
    $relativePath = "reports/strict-live-full-acceptance.md"
    $path = Join-Path $RepoRoot $relativePath
    if (-not (Test-Path -LiteralPath $path)) {
        Add-AuditResult "full-workspace-evidence" "pass" "No full workspace report is present; focused strict live report remains the required milestone evidence."
        return
    }
    $report = Get-Content -Raw -LiteralPath $path
    $required = @(
        "- Status: passed",
        "- Mode: strict-live-full",
        "- Full workspace suite: True",
        "server-tests",
        "workspace-typecheck",
        "final-export-pass-run"
    )
    $missing = @($required | Where-Object { -not $report.Contains($_) })
    if ($missing.Count -eq 0) {
        Add-AuditResult "full-workspace-evidence" "pass" "Latest full workspace strict acceptance report is passed and includes server/full workspace coverage."
    } else {
        Add-AuditResult "full-workspace-evidence" "fail" "Full workspace strict report missing: $($missing -join ', ')"
    }
}

function Test-DangerousResidue {
    $paths = @("packages/opencode/src/paper", "research-tools/src", "README.md")
    $patterns = @("scrapling_live_fetch_not_implemented", "network_not_authorized_mock_used", "TODO", "FIXME")
    $findings = New-Object "System.Collections.Generic.List[string]"
    foreach ($pattern in $patterns) {
        $args = @("grep", "-n", "-I", $pattern, "--") + $paths
        $result = Invoke-RepoCommand "git" $args
        if ($result.exit -eq 0) {
            foreach ($line in $result.output) {
                if ($line -match "Current runtime cleanup removed Phase 1") { continue }
                $findings.Add($line) | Out-Null
            }
        } elseif ($result.exit -gt 1) {
            Add-AuditResult "dangerous-residue" "fail" "git grep failed for ${pattern}: $($result.output -join ' ')"
            return
        }
    }
    if ($findings.Count -eq 0) {
        Add-AuditResult "dangerous-residue" "pass" "No dangerous TODO/FIXME/not-implemented/mock residue found in product paper paths."
    } else {
        Add-AuditResult "dangerous-residue" "fail" ($findings -join "; ")
    }
}

function Test-BrandSurface {
    $logo = Read-RepoText "packages/opencode/src/cli/logo.ts"
    $readme = Read-RepoText "README.md"
    if ($logo.Contains("Paper Fucker") -and $readme.Contains("Paper Fucker") -and $readme.Contains("PaperRun")) {
        Add-AuditResult "brand-surface" "pass" "Paper Fucker and PaperRun remain the documented user-visible product surface."
    } else {
        Add-AuditResult "brand-surface" "fail" "Paper Fucker/PaperRun product surface is missing from logo or README."
    }
}

function Test-PublicSurfaceNoLegacyBranding {
    $surfacePaths = @(
        "README.md",
        "packages/opencode/src/index.ts",
        "packages/opencode/src/cli/logo.ts",
        "packages/opencode/src/cli/cmd/tui/routes/home.tsx",
        "packages/opencode/src/cli/cmd/tui/routes/paper-models.tsx",
        "packages/opencode/src/cli/cmd/tui/routes/paper/index.tsx",
        "packages/opencode/src/cli/cmd/tui/routes/paper/workbench.ts",
        "packages/opencode/src/cli/cmd/tui/feature-plugins/home/tips-view.tsx",
        "packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/footer.tsx",
        "packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx",
        "packages/opencode/src/server/routes/instance/httpapi/groups/paper.ts",
        "packages/preview/src/client.js",
        "packages/preview/src/server.ts"
    )
    $patterns = @(
        "OpenCode",
        "Open Code",
        "Please report an issue",
        "Ask anything",
        "<b>Open</b>",
        "<b>Code</b>",
        "Login with opencode",
        "opencode-login",
        "opencode.ai"
    )
    $findings = New-Object "System.Collections.Generic.List[string]"
    foreach ($relativePath in $surfacePaths) {
        $path = Join-Path $RepoRoot $relativePath
        if (-not (Test-Path -LiteralPath $path)) {
            $findings.Add("${relativePath}: missing public surface file") | Out-Null
            continue
        }
        $text = Get-Content -Raw -LiteralPath $path
        foreach ($pattern in $patterns) {
            if ($text.Contains($pattern)) {
                $findings.Add("${relativePath}: contains '$pattern'") | Out-Null
            }
        }
    }
    if ($findings.Count -eq 0) {
        Add-AuditResult "public-surface-no-legacy-branding" "pass" "User-visible README, TUI, paper API, and Preview surfaces do not contain legacy product wording."
    } else {
        Add-AuditResult "public-surface-no-legacy-branding" "fail" ($findings -join "; ")
    }
}

function Test-GitFlow {
    $branch = (Invoke-RepoCommand "git" @("rev-parse", "--abbrev-ref", "HEAD")).output[-1].Trim()
    $forbidden = Invoke-RepoCommand "git" @("branch", "--format", "%(refname:short)")
    $forbiddenBranches = @($forbidden.output | Where-Object { $_ -match "^(codex/|task-)" })
    $branchOk = $branch -eq "develop" -or $branch -match "^(feature|fix)/[a-z0-9-]+$"
    if ($branchOk -and $forbiddenBranches.Count -eq 0) {
        Add-AuditResult "git-flow" "pass" "Branch $branch follows Git Flow; forbidden local branches absent."
    } else {
        Add-AuditResult "git-flow" "fail" "branch=$branch forbidden=$($forbiddenBranches -join ', ')"
    }
}

function Write-AuditReport {
    $report = Join-Path $RepoRoot $ReportPath
    $dir = Split-Path -Parent $report
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $overall = if ($Failed) { "failed" } else { "passed" }
    $lines = @(
        "# Autonomous Product Audit",
        "",
        "- Generated: $(Get-Date -Format o)",
        "- Status: $overall",
        "- Allow active task: $([bool]$AllowActiveTask)",
        "",
        "| Check | Status | Detail |",
        "| --- | --- | --- |"
    )
    foreach ($result in $Results) {
        $lines += "| ``$($result.id)`` | $($result.status) | $($result.detail) |"
    }
    Set-Content -LiteralPath $report -Encoding UTF8 -Value ($lines -join "`n")
}

Test-TaskFlowQueue
Test-VersionSync
Test-ChangelogShape
Test-DevelopmentDocs
Test-StrictEvidence
Test-FullWorkspaceEvidence
Test-DangerousResidue
Test-BrandSurface
Test-PublicSurfaceNoLegacyBranding
Test-GitFlow
Write-AuditReport

if ($Failed) {
    Write-Error "Autonomous product audit failed. See $ReportPath."
    exit 1
}

Write-Host "Autonomous product audit passed. Report: $ReportPath"
