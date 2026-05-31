param(
    [string]$Provider = "github-copilot",
    [string]$Directory = "",
    [switch]$SkipLogin
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $Directory) {
    $Directory = $RepoRoot
}

$Exe = Join-Path $RepoRoot "paper_fucker.exe"
if (-not (Test-Path -LiteralPath $Exe)) {
    $Exe = "paper_fucker.exe"
}

if (-not $SkipLogin) {
    & $Exe auth login --provider $Provider
    if ($LASTEXITCODE -ne 0) {
        throw "provider 登录失败: $Provider"
    }
}

npx --yes bun@1.3.13 --cwd "$RepoRoot\packages\opencode" ".\scripts\sync-subscription-provider.ts" --provider $Provider --directory $Directory
if ($LASTEXITCODE -ne 0) {
    throw "provider 模型同步失败: $Provider"
}
