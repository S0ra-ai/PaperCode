param(
    [Alias("Home")]
    [string]$UserHome = "",
    [string]$ReportPath = "reports/provider-matrix-smoke.md",
    [int]$TimeoutSeconds = 30,
    [switch]$SkipChat
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $UserHome) {
    $UserHome = if ($env:PAPER_FUCKER_HOME) { $env:PAPER_FUCKER_HOME } else { [Environment]::GetFolderPath("UserProfile") }
}

$PaperHome = Join-Path $UserHome ".paper_fucker"
$ProviderDir = Join-Path $PaperHome "providers"
$SecretPath = Join-Path $PaperHome "local/provider-secrets.json"
$ReportFullPath = Join-Path $RepoRoot $ReportPath

function Normalize-BaseUrl([string]$BaseUrl) {
    return $BaseUrl.TrimEnd("/")
}

function Read-JsonFile([string]$Path, [object]$Default) {
    if (-not (Test-Path -LiteralPath $Path)) { return $Default }
    return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
}

function Get-SecretValue([object]$Secrets, [string]$Ref) {
    if (-not $Secrets) { return $null }
    $prop = $Secrets.PSObject.Properties[$Ref]
    if (-not $prop) { return $null }
    return [string]$prop.Value
}

function Invoke-ProviderJson([string]$Url, [string]$ApiKey, [string]$Method, [object]$Body = $null) {
    $headers = @{
        Authorization = "Bearer $ApiKey"
        Accept = "application/json"
    }
    if ($Body -eq $null) {
        return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers -TimeoutSec $TimeoutSeconds
    }
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8) -TimeoutSec $TimeoutSeconds
}

function Get-ModelIds([object]$ModelResponse) {
    if (-not $ModelResponse -or -not $ModelResponse.data) { return @() }
    $ids = @()
    foreach ($item in $ModelResponse.data) {
        if ($item.id) { $ids += [string]$item.id }
    }
    return $ids
}

function Add-Result([System.Collections.Generic.List[object]]$Results, [string]$Provider, [string]$Status, [string]$ModelStatus, [string]$ChatStatus, [string]$Detail) {
    $Results.Add([pscustomobject]@{
        provider = $Provider
        status = $Status
        models = $ModelStatus
        chat = $ChatStatus
        detail = $Detail
    })
}

$results = New-Object System.Collections.Generic.List[object]
$secrets = Read-JsonFile $SecretPath ([pscustomobject]@{})

if (-not (Test-Path -LiteralPath $ProviderDir)) {
    Add-Result $results "none" "pending_config" "not_run" "not_run" "No provider configs found under $ProviderDir."
} else {
    $providerFiles = @(Get-ChildItem -LiteralPath $ProviderDir -Filter "*.json" -File | Sort-Object Name)
    if ($providerFiles.Count -eq 0) {
        Add-Result $results "none" "pending_config" "not_run" "not_run" "No provider configs found under $ProviderDir."
    }
    foreach ($file in $providerFiles) {
        $provider = Read-JsonFile $file.FullName $null
        $providerId = if ($provider.provider_id) { [string]$provider.provider_id } else { [string]$file.BaseName }
        try {
            if ($provider.compatibility -ne "openai-compatible") {
                Add-Result $results $providerId "skipped" "not_run" "not_run" "Unsupported compatibility: $($provider.compatibility)."
                continue
            }
            $apiKey = Get-SecretValue $secrets ([string]$provider.api_key_ref)
            if (-not $apiKey) {
                Add-Result $results $providerId "blocked" "not_run" "not_run" "Missing secret ref $($provider.api_key_ref)."
                continue
            }
            $baseUrl = Normalize-BaseUrl ([string]$provider.base_url)
            $modelResponse = Invoke-ProviderJson "$baseUrl/models" $apiKey "GET"
            $modelIds = @(Get-ModelIds $modelResponse)
            if ($modelIds.Count -eq 0) {
                Add-Result $results $providerId "blocked" "empty" "not_run" "Model discovery returned no model ids."
                continue
            }
            $model = $modelIds[0]
            if ($SkipChat) {
                Add-Result $results $providerId "passed" "passed:$($modelIds.Count)" "skipped" "First model: $model."
                continue
            }
            $chatBody = @{
                model = $model
                messages = @(
                    @{
                        role = "user"
                        content = "Paper Fucker provider matrix smoke. Reply OK."
                    }
                )
                max_tokens = 8
                temperature = 0
            }
            $null = Invoke-ProviderJson "$baseUrl/chat/completions" $apiKey "POST" $chatBody
            Add-Result $results $providerId "passed" "passed:$($modelIds.Count)" "passed" "First model: $model."
        } catch {
            Add-Result $results $providerId "failed" "failed" "failed" ($_.Exception.Message -replace "\|", "/")
        }
    }
}

$dir = Split-Path -Parent $ReportFullPath
if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$failedCount = @($results | Where-Object { $_.status -eq "failed" }).Count
$pendingCount = @($results | Where-Object { $_.status -eq "pending_config" }).Count
$status = if ($failedCount -gt 0) { "failed" } elseif ($pendingCount -gt 0) { "pending_config" } else { "completed" }
$lines = @(
    "# Provider Matrix Smoke",
    "",
    "- Generated: $(Get-Date -Format o)",
    "- Home: $UserHome",
    "- Status: $status",
    "- Chat smoke skipped: $([bool]$SkipChat)",
    "",
    "| Provider | Status | Models | Chat | Detail |",
    "| --- | --- | --- | --- | --- |"
)
foreach ($result in $results) {
    $lines += "| ``$($result.provider)`` | $($result.status) | $($result.models) | $($result.chat) | $($result.detail) |"
}
Set-Content -LiteralPath $ReportFullPath -Value $lines -Encoding UTF8

Write-Output "Provider matrix smoke report: $ReportFullPath"
Write-Output "Status: $status"
if ($status -eq "failed") { exit 1 }
