param(
  [string]$Path = "CHANGELOG"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Path)) {
  throw "CHANGELOG not found: $Path"
}

$lines = Get-Content -LiteralPath $Path
$inHistory = $false
$currentSection = $null
$problems = New-Object System.Collections.Generic.List[string]

for ($i = 0; $i -lt $lines.Count; $i++) {
  $line = $lines[$i]
  $lineNumber = $i + 1
  $trim = $line.Trim()

  if ($line -match "`t") {
    $problems.Add("line ${lineNumber}: tabs are not allowed")
  }

  if ($trim -eq ":history") {
    if ($line -ne ":history") {
      $problems.Add("line ${lineNumber}: :history must not be indented")
    }
    $inHistory = $true
    $currentSection = $null
    continue
  }

  if (-not $inHistory -or $trim.Length -eq 0) {
    continue
  }

  $isVersion = $trim -match '^\d+(?:\.\d+)+(?:-[A-Za-z0-9.]+)?\s+-\s+\d{4}/\d{2}/\d{2}\s+\([0-9A-Za-z]+\)\s+\[[^\]]+\]$'
  if ($isVersion) {
    if ($line -ne "    $trim") {
      $problems.Add("line ${lineNumber}: version entries must use 4-space indentation")
    }
    $currentSection = $null
    continue
  }

  if ($trim -match '^:([A-Za-z_]+)(?:\s+.*)?$') {
    if ($line -ne "        $trim") {
      $problems.Add("line ${lineNumber}: section headers must use 8-space indentation")
    }
    $currentSection = $matches[1]
    continue
  }

  if ($trim -match '^- ') {
    $expected = if ($currentSection -and $currentSection -ne "brief") { "            $trim" } else { "        $trim" }
    if ($line -ne $expected) {
      $problems.Add("line ${lineNumber}: list items have invalid indentation for section '$currentSection'")
    }
    continue
  }

  $expectedContinuation = if ($currentSection -and $currentSection -ne "brief") { "            $trim" } else { "        $trim" }
  if ($line -ne $expectedContinuation) {
    $problems.Add("line ${lineNumber}: continuation has invalid indentation for section '$currentSection'")
  }
}

if ($problems.Count -gt 0) {
  $problems | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "CHANGELOG colon-history indentation is valid."
