param(
  [string[]]$Path = @("CHANGELOG"),
  [switch]$IncludeArchives
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path

$utf8 = [System.Text.UTF8Encoding]::new($false)
$problems = New-Object System.Collections.Generic.List[string]

$paths = New-Object System.Collections.Generic.List[string]
foreach ($item in $Path) {
  if (-not (Test-Path -LiteralPath $item)) {
    throw "CHANGELOG not found: $item"
  }
  $paths.Add((Resolve-Path -LiteralPath $item).Path)
}

if ($IncludeArchives) {
  $archiveRoot = Join-Path $repoRoot "docs/changelog/v0"
  if (Test-Path -LiteralPath $archiveRoot) {
    Get-ChildItem -LiteralPath $archiveRoot -Filter "*.CHANGELOG" | Sort-Object FullName | ForEach-Object {
      if (-not $paths.Contains($_.FullName)) {
        $paths.Add($_.FullName)
      }
    }
  }
}

foreach ($resolvedPath in $paths) {
  $displayPath = if ($resolvedPath.StartsWith($repoRoot)) {
    $resolvedPath.Substring($repoRoot.Length).TrimStart("\", "/").Replace("\", "/")
  } else {
    $resolvedPath.Replace("\", "/")
  }
  $lines = [System.IO.File]::ReadAllLines($resolvedPath, $utf8)
  $inHistory = $false
  $currentSection = $null
  $currentVersion = $null
  $currentVersionLine = 0
  $currentVersionItems = 0
  $isRootChangelog = $displayPath -eq "CHANGELOG"

  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $lineNumber = $i + 1
    $trim = $line.Trim()

    if ($line -match "`t") {
      $problems.Add("${displayPath}:${lineNumber}: tabs are not allowed")
    }

    if ($line -ne $line.TrimEnd()) {
      $problems.Add("${displayPath}:${lineNumber}: trailing whitespace is not allowed")
    }

    if ($trim -eq ":history") {
      if ($line -ne ":history") {
        $problems.Add("${displayPath}:${lineNumber}: :history must not be indented")
      }
      if ($i -eq 0 -or $lines[$i - 1].Trim().Length -ne 0) {
        $problems.Add("${displayPath}:${lineNumber}: :history must be preceded by one blank line")
      }
      if ($i -gt 1 -and $lines[$i - 2].Trim().Length -eq 0) {
        $problems.Add("${displayPath}:${lineNumber}: :history must not be preceded by multiple blank lines")
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
      if ($isRootChangelog -and $currentVersion -and $currentVersionItems -gt 45) {
        $problems.Add("${displayPath}:${currentVersionLine}: version '$currentVersion' has $currentVersionItems list items; split or summarize the entry")
      }
      if ($line -ne "    $trim") {
        $problems.Add("${displayPath}:${lineNumber}: version entries must use 4-space indentation")
      }

      if ($i -eq 0 -or $lines[$i - 1].Trim().Length -ne 0) {
        $problems.Add("${displayPath}:${lineNumber}: version entries must be preceded by one blank line")
      }
      if ($i -gt 1 -and $lines[$i - 2].Trim().Length -eq 0) {
        $problems.Add("${displayPath}:${lineNumber}: version entries must not be preceded by multiple blank lines")
      }

      $currentSection = $null
      $currentVersion = $trim
      $currentVersionLine = $lineNumber
      $currentVersionItems = 0
      continue
    }

    if ($trim -match '^:([A-Za-z_]+)(?:\s+.*)?$') {
      if ($line -ne "        $trim") {
        $problems.Add("${displayPath}:${lineNumber}: section headers must use 8-space indentation")
      }
      $currentSection = $matches[1]
      if ($isRootChangelog -and $currentSection -eq "commits") {
        $problems.Add("${displayPath}:${lineNumber}: root CHANGELOG entries must not use :commits aggregation blocks")
      }
      if ($isRootChangelog -and $currentSection -eq "brief" -and $trim.Length -gt 160) {
        $problems.Add("${displayPath}:${lineNumber}: :brief is too long; summarize and move details into grouped sections")
      }
      continue
    }

    if ($trim -match '^- ') {
      $currentVersionItems += 1
      $expected = if ($currentSection -and $currentSection -ne "brief") { "            $trim" } else { "        $trim" }
      if ($line -ne $expected) {
        $problems.Add("${displayPath}:${lineNumber}: list items have invalid indentation for section '$currentSection'")
      }
      continue
    }

    $expectedContinuation = if ($currentSection -and $currentSection -ne "brief") { "            $trim" } else { "        $trim" }
    if ($line -ne $expectedContinuation) {
      $problems.Add("${displayPath}:${lineNumber}: continuation has invalid indentation for section '$currentSection'")
    }
  }

  if ($isRootChangelog -and $currentVersion -and $currentVersionItems -gt 45) {
    $problems.Add("${displayPath}:${currentVersionLine}: version '$currentVersion' has $currentVersionItems list items; split or summarize the entry")
  }
}

if ($problems.Count -gt 0) {
  $problems | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "CHANGELOG colon-history indentation is valid for $($paths.Count) file(s)."
