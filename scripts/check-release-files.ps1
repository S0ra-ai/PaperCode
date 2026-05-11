param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

function Normalize-PathText {
    param([string]$Path)
    return ($Path -replace "\\", "/").TrimStart("./")
}

function Invoke-Checked {
    param(
        [string]$File,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    $output = & $File @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $File $($Arguments -join ' ')"
    }
    return @($output)
}

function Get-SourceArchiveFiles {
    param([string]$Root)

    $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("paper-fucker-release-archive-{0}.tar" -f ([System.Guid]::NewGuid().ToString("N")))
    try {
        Invoke-Checked -File "git" -Arguments @("-C", $Root, "archive", "--worktree-attributes", "--format=tar", "-o", $temp, "HEAD") -WorkingDirectory $Root | Out-Null
        return @(Invoke-Checked -File "tar" -Arguments @("-tf", $temp) -WorkingDirectory $Root | ForEach-Object { Normalize-PathText $_ })
    }
    finally {
        if (Test-Path -LiteralPath $temp) {
            Remove-Item -LiteralPath $temp -Force
        }
    }
}

function Get-NpmPackFiles {
    param([string]$PackageDir)

    Push-Location $PackageDir
    try {
        $jsonText = (& npm pack --dry-run --json 2>$null) -join "`n"
        if ($LASTEXITCODE -ne 0) {
            throw "npm pack --dry-run failed in $PackageDir"
        }
        $records = @($jsonText | ConvertFrom-Json)
        if ($records.Count -eq 0) {
            throw "npm pack returned no package records in $PackageDir"
        }
        return @($records[0].files | ForEach-Object { Normalize-PathText $_.path })
    }
    finally {
        Pop-Location
    }
}

function Find-BlockedPaths {
    param(
        [string[]]$Paths,
        [object[]]$Rules
    )

    $blocked = @()
    foreach ($rule in $Rules) {
        foreach ($path in $Paths) {
            if ($path -match $rule.Pattern) {
                $blocked += [PSCustomObject]@{
                    rule = $rule.Name
                    path = $path
                }
            }
        }
    }
    return @($blocked)
}

function Write-Section {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$Title,
        [string[]]$Files,
        [object[]]$Blocked
    )

    $Lines.Add("## $Title") | Out-Null
    $Lines.Add("") | Out-Null
    $Lines.Add("- files: $($Files.Count)") | Out-Null
    $Lines.Add("- blocked: $($Blocked.Count)") | Out-Null
    $status = if ($Blocked.Count -eq 0) { "passed" } else { "failed" }
    $Lines.Add("- status: $status") | Out-Null
    $Lines.Add("") | Out-Null

    if ($Blocked.Count -gt 0) {
        $Lines.Add("### Blocked paths") | Out-Null
        $Lines.Add("") | Out-Null
        foreach ($item in $Blocked | Select-Object -First 80) {
            $Lines.Add(("- {0}: {1}" -f $item.rule, $item.path)) | Out-Null
        }
        if ($Blocked.Count -gt 80) {
            $remaining = $Blocked.Count - 80
            $Lines.Add("- ... $remaining more") | Out-Null
        }
        $Lines.Add("") | Out-Null
    }
}

$RepoRoot = (Resolve-Path $RepoRoot).Path
$reportPath = Join-Path $RepoRoot "reports/release-file-audit.md"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $reportPath) | Out-Null

$sourceRules = @(
    [PSCustomObject]@{ Name = "taskflow-plan"; Pattern = '^\.plan(/|$)' },
    [PSCustomObject]@{ Name = "reports"; Pattern = '^reports(/|$)' },
    [PSCustomObject]@{ Name = "legacy"; Pattern = '^legacy(/|$)' },
    [PSCustomObject]@{ Name = "upstream"; Pattern = '^upstream(/|$)' },
    [PSCustomObject]@{ Name = "changelog-archive"; Pattern = '^docs/changelog/v0(/|$)' },
    [PSCustomObject]@{ Name = "local-runtime"; Pattern = '^\.paper_fucker/(local|runs)(/|$)' },
    [PSCustomObject]@{ Name = "workspace-cache"; Pattern = '(^|/)(node_modules|tmp|\.turbo)(/|$)' },
    [PSCustomObject]@{ Name = "test-tree"; Pattern = '(^|/)(test|tests)(/|$)' },
    [PSCustomObject]@{ Name = "spec-tree"; Pattern = '(^|/)specs(/|$)' },
    [PSCustomObject]@{ Name = "upstream-marketing-assets"; Pattern = '^packages/(console/app/src/asset/lander|web/src/assets/lander|web/src/content/docs|docs)(/|$)' },
    [PSCustomObject]@{ Name = "secret-shaped-path"; Pattern = '(^|/)(deepseek\.env|provider-secrets\.json|\.env(\.|$)|.*api[-_]?key.*\.env)$' }
)

$opencodeRules = @(
    [PSCustomObject]@{ Name = "tests"; Pattern = '^(test|tests)(/|$)' },
    [PSCustomObject]@{ Name = "specs"; Pattern = '^specs(/|$)' },
    [PSCustomObject]@{ Name = "developer-script"; Pattern = '^script/(?!postinstall\.mjs$)' },
    [PSCustomObject]@{ Name = "developer-doc"; Pattern = '^(AGENTS\.md|BUN_SHELL_MIGRATION_PLAN\.md|Dockerfile|git|sst-env\.d\.ts)$' },
    [PSCustomObject]@{ Name = "large-fixture"; Pattern = '(^|/)fixtures/(large-image\.png|models-api\.json)$' },
    [PSCustomObject]@{ Name = "provenance"; Pattern = '(^|/)(reports|legacy|upstream|\.plan)(/|$)' }
)

$previewRules = @(
    [PSCustomObject]@{ Name = "tests"; Pattern = '^(test|tests)(/|$)' },
    [PSCustomObject]@{ Name = "tsconfig"; Pattern = '^tsconfig\.json$' },
    [PSCustomObject]@{ Name = "provenance"; Pattern = '(^|/)(reports|legacy|upstream|\.plan)(/|$)' }
)

$sourceFiles = Get-SourceArchiveFiles -Root $RepoRoot
$opencodeFiles = Get-NpmPackFiles -PackageDir (Join-Path $RepoRoot "packages/opencode")
$previewFiles = Get-NpmPackFiles -PackageDir (Join-Path $RepoRoot "packages/preview")

$sourceBlocked = Find-BlockedPaths -Paths $sourceFiles -Rules $sourceRules
$opencodeBlocked = Find-BlockedPaths -Paths $opencodeFiles -Rules $opencodeRules
$previewBlocked = Find-BlockedPaths -Paths $previewFiles -Rules $previewRules

$publishScript = Get-Content -LiteralPath (Join-Path $RepoRoot "packages/opencode/script/publish.ts") -Raw
$binaryManifestPassed = (
    ($publishScript -match 'cp -r \./bin') -and
    ($publishScript -match 'postinstall\.mjs') -and
    ($publishScript -match 'LICENSE') -and
    ($publishScript -match 'package\.json')
)

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("# Release File Audit") | Out-Null
$lines.Add("") | Out-Null
$lines.Add(("- generated_at: {0}" -f (Get-Date -Format o))) | Out-Null
$lines.Add(("- repo_root: {0}" -f $RepoRoot)) | Out-Null
$lines.Add("- policy: keep provenance in git, keep release artifacts product/runtime only.") | Out-Null
$lines.Add("") | Out-Null

Write-Section -Lines $lines -Title "GitHub Source Archive" -Files $sourceFiles -Blocked $sourceBlocked
Write-Section -Lines $lines -Title "packages/opencode npm pack" -Files $opencodeFiles -Blocked $opencodeBlocked
Write-Section -Lines $lines -Title "packages/preview npm pack" -Files $previewFiles -Blocked $previewBlocked

$lines.Add("## Binary Release Manifest") | Out-Null
$lines.Add("") | Out-Null
$binaryStatus = if ($binaryManifestPassed) { "passed" } else { "failed" }
$lines.Add("- status: $binaryStatus") | Out-Null
$lines.Add("- expected: bin, postinstall.mjs, LICENSE, package.json") | Out-Null
$lines.Add("") | Out-Null

$allBlocked = @()
$allBlocked += @($sourceBlocked)
$allBlocked += @($opencodeBlocked)
$allBlocked += @($previewBlocked)
if (-not $binaryManifestPassed) {
    $allBlocked += [PSCustomObject]@{ rule = "binary-manifest"; path = "packages/opencode/script/publish.ts" }
}

$lines.Add("## Summary") | Out-Null
$lines.Add("") | Out-Null
$lines.Add("- total_blockers: $($allBlocked.Count)") | Out-Null
$result = if ($allBlocked.Count -eq 0) { "passed" } else { "failed" }
$lines.Add("- result: $result") | Out-Null
$lines.Add("") | Out-Null

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($reportPath, $lines, $utf8NoBom)

if ($allBlocked.Count -gt 0) {
    throw "Release file audit failed with $($allBlocked.Count) blocker(s). See $reportPath"
}

Write-Host "Release file audit passed: $reportPath"
