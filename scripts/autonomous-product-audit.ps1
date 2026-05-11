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
    $hasEntry = $text.Contains("[develop]") -and ($text -match '\([0-9a-f]{7,40}\)')
    $badMarkdown = $text -match '(?m)^#{1,6}\s'
    if ($hasHeader -and $hasEntry -and -not $badMarkdown) {
        Add-AuditResult "changelog-shape" "pass" "CHANGELOG keeps colon DSL header/history and real commit ids."
    } else {
        Add-AuditResult "changelog-shape" "fail" "CHANGELOG colon DSL shape check failed."
    }
}

function Test-StrictEvidence {
    $report = Read-RepoText "reports/strict-live-acceptance.md"
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
    if ($missing.Count -eq 0) {
        Add-AuditResult "strict-live-evidence" "pass" "Latest strict live report proves focused live crawler, HF, topic/code, and final export pass scenarios."
    } else {
        Add-AuditResult "strict-live-evidence" "fail" "Strict report missing: $($missing -join ', ')"
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

function Test-GitFlow {
    $branch = (Invoke-RepoCommand "git" @("rev-parse", "--abbrev-ref", "HEAD")).output[-1].Trim()
    $status = Invoke-RepoCommand "git" @("status", "--short")
    $forbidden = Invoke-RepoCommand "git" @("branch", "--format", "%(refname:short)")
    $forbiddenBranches = @($forbidden.output | Where-Object { $_ -match "^(codex/|task-)" })
    $branchOk = $branch -eq "develop" -or $branch -match "^(feature|fix)/[a-z0-9-]+$"
    if ($branchOk -and $forbiddenBranches.Count -eq 0) {
        Add-AuditResult "git-flow" "pass" "Branch $branch follows Git Flow; forbidden local branches absent; working entries=$($status.output.Count)."
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
Test-StrictEvidence
Test-FullWorkspaceEvidence
Test-DangerousResidue
Test-BrandSurface
Test-GitFlow
Write-AuditReport

if ($Failed) {
    Write-Error "Autonomous product audit failed. See $ReportPath."
    exit 1
}

Write-Host "Autonomous product audit passed. Report: $ReportPath"
