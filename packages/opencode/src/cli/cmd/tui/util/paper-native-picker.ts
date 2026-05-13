import { execFile as execFileCallback } from "child_process"
import { promisify } from "util"
import path from "path"

const execFile = promisify(execFileCallback)

export type PaperPickerMode = "folder" | "file"

export type PaperPickerResult = {
  mode: PaperPickerMode
  paths: string[]
  source: "native" | "fallback"
}

export type PaperNativePickerOptions = {
  mode: PaperPickerMode
  title?: string
  initialPath?: string
  multi?: boolean
}

function normalizeOutput(stdout: string) {
  return stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

async function windowsPicker(options: PaperNativePickerOptions): Promise<PaperPickerResult | undefined> {
  const script = String.raw`
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$mode = $env:PF_PICKER_MODE
$title = $env:PF_PICKER_TITLE
$initial = $env:PF_PICKER_INITIAL
if ($mode -eq "folder") {
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = $title
  $dialog.ShowNewFolderButton = $true
  if ($initial -and (Test-Path -LiteralPath $initial)) { $dialog.SelectedPath = $initial }
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
    exit 0
  }
  exit 2
}
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = $title
$dialog.CheckFileExists = $true
$dialog.Multiselect = $env:PF_PICKER_MULTI -eq "1"
if ($initial -and (Test-Path -LiteralPath $initial)) {
  if ((Get-Item -LiteralPath $initial).PSIsContainer) { $dialog.InitialDirectory = $initial }
  else { $dialog.InitialDirectory = Split-Path -Parent $initial }
}
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  foreach ($item in $dialog.FileNames) { Write-Output $item }
  exit 0
}
exit 2
`
  const result = await execFile("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script], {
    windowsHide: false,
    env: {
      ...process.env,
      PF_PICKER_MODE: options.mode,
      PF_PICKER_TITLE: options.title ?? "Paper Fucker 选择路径",
      PF_PICKER_INITIAL: options.initialPath ?? process.cwd(),
      PF_PICKER_MULTI: options.multi ? "1" : "0",
    },
    encoding: "utf8",
  }).catch((error: NodeJS.ErrnoException & { code?: number | string; stdout?: string }) => {
    if (String(error.code) === "2") return undefined
    throw error
  })
  if (!result) return undefined
  const paths = normalizeOutput(result.stdout)
  if (paths.length === 0) return undefined
  return { mode: options.mode, paths, source: "native" }
}

async function macPicker(options: PaperNativePickerOptions): Promise<PaperPickerResult | undefined> {
  const initial = options.initialPath ? ` default location POSIX file ${JSON.stringify(path.resolve(options.initialPath))}` : ""
  const script =
    options.mode === "folder"
      ? `set picked to choose folder with prompt ${JSON.stringify(options.title ?? "Paper Fucker 选择工作目录")}${initial}\nPOSIX path of picked`
      : `set picked to choose file with prompt ${JSON.stringify(options.title ?? "Paper Fucker 选择文件")}${initial}${options.multi ? " with multiple selections allowed" : ""}\nif class of picked is list then\nset out to \"\"\nrepeat with itemRef in picked\nset out to out & POSIX path of itemRef & linefeed\nend repeat\nout\nelse\nPOSIX path of picked\nend if`
  const result = await execFile("osascript", ["-e", script], { encoding: "utf8" }).catch((error: NodeJS.ErrnoException & { code?: number | string }) => {
    if (String(error.code) === "1") return undefined
    throw error
  })
  if (!result) return undefined
  const paths = normalizeOutput(result.stdout)
  if (paths.length === 0) return undefined
  return { mode: options.mode, paths, source: "native" }
}

async function linuxPicker(options: PaperNativePickerOptions): Promise<PaperPickerResult | undefined> {
  const title = options.title ?? (options.mode === "folder" ? "Paper Fucker 选择工作目录" : "Paper Fucker 选择文件")
  const zenityArgs = options.mode === "folder" ? ["--file-selection", "--directory", "--title", title] : ["--file-selection", "--title", title]
  if (options.multi && options.mode === "file") zenityArgs.push("--multiple", "--separator", "\n")
  if (options.initialPath) zenityArgs.push("--filename", path.resolve(options.initialPath) + path.sep)
  const zenity = await execFile("zenity", zenityArgs, { encoding: "utf8" }).catch(() => undefined)
  let stdout = zenity?.stdout
  if (!stdout) {
    const kdialogArgs = options.mode === "folder" ? ["--getexistingdirectory", options.initialPath ?? process.cwd(), "--title", title] : ["--getopenfilename", options.initialPath ?? process.cwd(), "--title", title]
    const kdialog = await execFile("kdialog", kdialogArgs, { encoding: "utf8" }).catch(() => undefined)
    stdout = kdialog?.stdout
  }
  if (!stdout) return undefined
  const paths = normalizeOutput(stdout)
  if (paths.length === 0) return undefined
  return { mode: options.mode, paths, source: "native" }
}

export async function openPaperNativePicker(options: PaperNativePickerOptions): Promise<PaperPickerResult | undefined> {
  if (process.platform === "win32") return windowsPicker(options)
  if (process.platform === "darwin") return macPicker(options)
  return linuxPicker(options)
}
