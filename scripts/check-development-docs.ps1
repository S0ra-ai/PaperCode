param(
    [switch]$Render,
    [switch]$RequireChrome
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$docsRoot = Join-Path $repoRoot "docs/development"
$manualJs = Join-Path $docsRoot "assets/manual.js"
$styleCss = Join-Path $docsRoot "assets/style.css"
$utf8 = [System.Text.UTF8Encoding]::new($false)
$problems = New-Object System.Collections.Generic.List[string]

function Add-Problem {
    param([string]$Message)
    $problems.Add($Message) | Out-Null
}

function Get-RelativePath {
    param([string]$Path)
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    if ($resolved.StartsWith($repoRoot)) {
        return $resolved.Substring($repoRoot.Length).TrimStart("\", "/").Replace("\", "/")
    }
    return $resolved.Replace("\", "/")
}

function Invoke-NodeCheck {
    param([string]$Path)
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        Add-Problem "node is required to validate docs/development/assets/manual.js"
        return
    }
    $output = & $node.Source --check $Path 2>&1
    if ($LASTEXITCODE -ne 0) {
        Add-Problem "node --check failed for $(Get-RelativePath $Path): $output"
    }
}

function Find-Chrome {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }
    $command = Get-Command chrome, msedge, chromium -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    return $null
}

if (-not (Test-Path -LiteralPath $docsRoot)) {
    throw "Development docs root not found: $docsRoot"
}
if (-not (Test-Path -LiteralPath $manualJs)) {
    throw "Development docs manual script not found: $manualJs"
}
if (-not (Test-Path -LiteralPath $styleCss)) {
    throw "Development docs stylesheet not found: $styleCss"
}

Invoke-NodeCheck $manualJs

$manualText = [System.IO.File]::ReadAllText($manualJs, $utf8)
$pageMatches = [regex]::Matches($manualText, '\["([^"]+\.html)",\s*"([^"]+)"')
$pages = New-Object System.Collections.Generic.List[object]
foreach ($match in $pageMatches) {
    $pages.Add([pscustomobject]@{
        href = $match.Groups[1].Value
        title = $match.Groups[2].Value
    }) | Out-Null
}
if ($pages.Count -lt 10) {
    Add-Problem "manual.js should declare the development manual page inventory"
}

$pageByHref = @{}
foreach ($page in $pages) {
    if ($pageByHref.ContainsKey($page.href)) {
        Add-Problem "manual.js contains duplicate page '$($page.href)'"
    } else {
        $pageByHref[$page.href] = $page
    }
}

foreach ($page in $pages) {
    $pagePath = Join-Path $docsRoot $page.href
    if (-not (Test-Path -LiteralPath $pagePath)) {
        Add-Problem "manual.js references missing page '$($page.href)'"
    }
}

$htmlFiles = Get-ChildItem -LiteralPath $docsRoot -Filter "*.html" | Sort-Object Name
foreach ($file in $htmlFiles) {
    if (-not $pageByHref.ContainsKey($file.Name)) {
        Add-Problem "$($file.Name) exists but is not listed in manual.js"
    }
}

foreach ($file in $htmlFiles) {
    $text = [System.IO.File]::ReadAllText($file.FullName, $utf8)
    $relative = Get-RelativePath $file.FullName

    if ($text -notmatch '<html lang="zh-CN">') {
        Add-Problem "${relative}: missing zh-CN html lang"
    }
    if ($text -notmatch '<main class="content">') {
        Add-Problem "${relative}: missing main.content"
    }
    if ($text -notmatch 'assets/manual\.js') {
        Add-Problem "${relative}: missing manual.js include"
    }
    if ($text -notmatch '<link rel="stylesheet" href="./assets/style.css"') {
        Add-Problem "${relative}: missing shared stylesheet"
    }
    if ($text -notmatch '<link rel="icon" href="./assets/favicon.svg" type="image/svg\+xml" />') {
        Add-Problem "${relative}: missing development manual favicon"
    }
    if ($text -notmatch 'class="active"') {
        Add-Problem "${relative}: missing active navigation item"
    }

    foreach ($page in $pages) {
        $escaped = [regex]::Escape($page.href)
        if ($text -notmatch "href=`"\./$escaped`"") {
            Add-Problem "${relative}: missing navigation link to $($page.href)"
        }
    }

    $linkMatches = [regex]::Matches($text, 'href="\./([^"#]+)(?:#[^"]*)?"')
    foreach ($link in $linkMatches) {
        $targetName = $link.Groups[1].Value
        $targetPath = Join-Path $file.DirectoryName $targetName
        if (-not (Test-Path -LiteralPath $targetPath)) {
            Add-Problem "${relative}: missing linked file '$targetName'"
        }
    }
}

$styleText = [System.IO.File]::ReadAllText($styleCss, $utf8)
foreach ($selector in @(".doc-toolbar", ".doc-search", ".page-toc", ".prev-next", ".code-block", ".copy-code", ".pattern-grid", "body.theme-light", "@media (max-width: 860px)")) {
    if ($styleText -notmatch [regex]::Escape($selector)) {
        Add-Problem "docs/development/assets/style.css missing selector '$selector'"
    }
}

foreach ($selector in @(".mode-list", ".kbd")) {
    if ($styleText -notmatch [regex]::Escape($selector)) {
        Add-Problem "docs/development/assets/style.css missing usage-guide selector '$selector'"
    }
}

$usageGuide = Join-Path $docsRoot "usage-guide.html"
if (Test-Path -LiteralPath $usageGuide) {
    $usageText = [System.IO.File]::ReadAllText($usageGuide, $utf8)
    foreach ($needle in @('id="parameters"', 'id="modes"', 'id="materials"', 'id="quality"', 'id="monitor"')) {
        if ($usageText -notmatch [regex]::Escape($needle)) {
            Add-Problem "docs/development/usage-guide.html missing section '$needle'"
        }
    }
} else {
    Add-Problem "docs/development/usage-guide.html is missing"
}

foreach ($needle in @("installToolbar", "installCodeCopy", "data-action=`"theme`"", "data-action=`"wide`"", "data-action=`"nav`"", "sourceHref", "copy-code")) {
    if ($manualText -notmatch [regex]::Escape($needle)) {
        Add-Problem "docs/development/assets/manual.js missing '$needle'"
    }
}

$indexPage = Join-Path $docsRoot "index.html"
if (Test-Path -LiteralPath $indexPage) {
    $indexText = [System.IO.File]::ReadAllText($indexPage, $utf8)
    foreach ($needle in @('id="doc-pattern"', 'class="pattern-grid"', 'href="#doc-pattern"')) {
        if ($indexText -notmatch [regex]::Escape($needle)) {
            Add-Problem "docs/development/index.html missing development manual pattern '$needle'"
        }
    }
} else {
    Add-Problem "docs/development/index.html is missing"
}

$developerGuide = Join-Path $docsRoot "development-guide.html"
if (Test-Path -LiteralPath $developerGuide) {
    $guideText = [System.IO.File]::ReadAllText($developerGuide, $utf8)
    foreach ($needle in @('id="page-template"', 'class="pattern-grid compact"', 'href="#page-template"')) {
        if ($guideText -notmatch [regex]::Escape($needle)) {
            Add-Problem "docs/development/development-guide.html missing developer page template '$needle'"
        }
    }
} else {
    Add-Problem "docs/development/development-guide.html is missing"
}

if ($Render) {
    $chrome = Find-Chrome
    if (-not $chrome) {
        if ($RequireChrome) {
            Add-Problem "Chrome or Edge is required for -Render -RequireChrome"
        } else {
            Write-Output "Chrome render check skipped: Chrome or Edge was not found."
        }
    } else {
        foreach ($pageName in @("index.html", "api-contracts.html")) {
            $pagePath = Join-Path $docsRoot $pageName
            $uri = "file:///" + ((Resolve-Path -LiteralPath $pagePath).Path.Replace("\", "/"))
            $rendered = & $chrome --headless=new --disable-gpu --no-sandbox --dump-dom --virtual-time-budget=1000 $uri | Out-String
            if ($LASTEXITCODE -ne 0) {
                Add-Problem "Chrome failed to render docs/development/${pageName}"
                continue
            }
            foreach ($needle in @("doc-toolbar", "doc-search", "page-toc", "copy-code")) {
                if ($rendered -notmatch [regex]::Escape($needle)) {
                    Add-Problem "Chrome render for docs/development/$pageName did not include '$needle'"
                }
            }
        }
    }
}

if ($problems.Count -gt 0) {
    $problems | ForEach-Object { Write-Error $_ }
    exit 1
}

$renderStatus = if ($Render) { " with render check" } else { "" }
Write-Output "Development docs check passed for $($htmlFiles.Count) HTML page(s)$renderStatus."
