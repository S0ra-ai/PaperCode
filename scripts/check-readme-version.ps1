Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$changelogPath = Join-Path $repoRoot "CHANGELOG"
$readmePath = Join-Path $repoRoot "README.md"

if (-not (Test-Path -LiteralPath $changelogPath)) {
    throw "CHANGELOG not found at $changelogPath"
}

if (-not (Test-Path -LiteralPath $readmePath)) {
    throw "README.md not found at $readmePath"
}

$changelog = Get-Content -Raw -LiteralPath $changelogPath
$readme = Get-Content -Raw -LiteralPath $readmePath

$metadataPattern = '(?m)^:version\s+([0-9A-Za-z][0-9A-Za-z.-]*)\s*$'
if ($changelog -notmatch $metadataPattern) {
    throw "Could not find CHANGELOG metadata version. Expected: :version 0.1.0-dev"
}
$metadataVersion = $Matches[1].Trim()

$historyPattern = '(?m)^\s{4}([0-9A-Za-z][0-9A-Za-z.-]*)\s+-\s+\d{4}/\d{2}/\d{2}\s+\([0-9a-fA-F]{7,40}\)\s+\[[^\]]+\]\s*$'
if ($changelog -notmatch $historyPattern) {
    throw "Could not find latest CHANGELOG history entry. Expected: four-space indented VERSION - YYYY/MM/DD (real commit hash) [branch]"
}
$latestVersion = $Matches[1].Trim()

if ($metadataVersion -ne $latestVersion) {
    Write-Error "CHANGELOG :version '$metadataVersion' does not match latest history version '$latestVersion'."
    exit 1
}

$readmePattern = '<!-- version:start -->([^<\r\n]+)<!-- version:end -->'
if ($readme -notmatch $readmePattern) {
    throw "Could not find README version marker. Expected: <!-- version:start -->VERSION<!-- version:end -->"
}
$readmeVersion = $Matches[1].Trim()

if ($readmeVersion -ne $latestVersion) {
    Write-Error "README version '$readmeVersion' does not match CHANGELOG latest version '$latestVersion'."
    exit 1
}

Write-Host "README version $readmeVersion matches CHANGELOG latest version."
