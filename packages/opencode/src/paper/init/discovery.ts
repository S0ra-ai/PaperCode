import { existsSync } from "fs"
import os from "os"
import path from "path"
import { PYTHON_EXECUTABLES } from "@/paper/python"

export type InitToolName =
  | "pandoc"
  | "latexmk"
  | "xelatex"
  | "pdflatex"
  | "lualatex"
  | "tectonic"
  | "docker"
  | "python"
  | "git"
  | "chrome"
  | "edge"

export type ToolDiscoveryState = {
  name: InitToolName
  role: string
  status: "available" | "missing"
  path?: string
  source?: "config" | "env" | "path" | "common"
  message?: string
}

export type ToolDiscoveryReport = {
  tools: Record<InitToolName, ToolDiscoveryState>
}

type ToolSpec = {
  name: InitToolName
  role: string
  executables: string[]
  env: string
  common: string[]
}

const SPECS: ToolSpec[] = [
  {
    name: "pandoc",
    role: "markdown/latex/docx conversion",
    executables: ["pandoc"],
    env: "PAPERCODE_TOOL_PANDOC",
    common: ["C:/Program Files/Pandoc/pandoc.exe", "C:/ProgramData/chocolatey/bin/pandoc.exe"],
  },
  {
    name: "latexmk",
    role: "latex build orchestration",
    executables: ["latexmk"],
    env: "PAPERCODE_TOOL_LATEXMK",
    common: ["C:/texlive/2024/bin/windows/latexmk.exe", "D:/Program/texlive/2024/bin/windows/latexmk.exe"],
  },
  {
    name: "xelatex",
    role: "unicode latex to pdf engine",
    executables: ["xelatex"],
    env: "PAPERCODE_TOOL_XELATEX",
    common: ["C:/texlive/2024/bin/windows/xelatex.exe", "D:/Program/texlive/2024/bin/windows/xelatex.exe"],
  },
  {
    name: "pdflatex",
    role: "latex to pdf engine",
    executables: ["pdflatex"],
    env: "PAPERCODE_TOOL_PDFLATEX",
    common: ["C:/texlive/2024/bin/windows/pdflatex.exe", "D:/Program/texlive/2024/bin/windows/pdflatex.exe"],
  },
  {
    name: "lualatex",
    role: "lua latex to pdf engine",
    executables: ["lualatex"],
    env: "PAPERCODE_TOOL_LUALATEX",
    common: ["C:/texlive/2024/bin/windows/lualatex.exe", "D:/Program/texlive/2024/bin/windows/lualatex.exe"],
  },
  {
    name: "tectonic",
    role: "self-contained latex to pdf engine",
    executables: ["tectonic"],
    env: "PAPERCODE_TOOL_TECTONIC",
    common: [],
  },
  {
    name: "docker",
    role: "containerized tool execution",
    executables: ["docker"],
    env: "PAPERCODE_TOOL_DOCKER",
    common: ["C:/Program Files/Docker/Docker/resources/bin/docker.exe"],
  },
  {
    name: "python",
    role: "Python research tools",
    executables: [...PYTHON_EXECUTABLES],
    env: "PAPERCODE_TOOL_PYTHON",
    common: ["C:/Windows/py.exe"],
  },
  {
    name: "git",
    role: "repository inspection",
    executables: ["git"],
    env: "PAPERCODE_TOOL_GIT",
    common: ["C:/Program Files/Git/cmd/git.exe"],
  },
  {
    name: "chrome",
    role: "browser preview",
    executables: ["chrome", "chrome.exe", "google-chrome"],
    env: "PAPERCODE_TOOL_CHROME",
    common: ["C:/Program Files/Google/Chrome/Application/chrome.exe"],
  },
  {
    name: "edge",
    role: "browser preview",
    executables: ["msedge", "msedge.exe"],
    env: "PAPERCODE_TOOL_EDGE",
    common: ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"],
  },
]

function commonInstallPaths(spec: ToolSpec) {
  if (process.platform !== "win32") return spec.common
  const userProfile = process.env.USERPROFILE || os.homedir()
  const local = process.env.LOCALAPPDATA || path.join(userProfile, "AppData", "Local")
  const roaming = process.env.APPDATA || path.join(userProfile, "AppData", "Roaming")
  const programFiles = process.env.ProgramFiles || "C:/Program Files"
  if (spec.name === "pandoc") {
    return [
      path.join(local, "Pandoc", "pandoc.exe"),
      path.join(local, "Programs", "Pandoc", "pandoc.exe"),
      path.join(programFiles, "Pandoc", "pandoc.exe"),
      ...spec.common,
    ]
  }
  if (["latexmk", "xelatex", "pdflatex", "lualatex"].includes(spec.name)) {
    return [
      ...[path.join(local, "Programs", "MiKTeX"), path.join(roaming, "MiKTeX"), path.join(programFiles, "MiKTeX")].flatMap(
        (root) => [path.join(root, "miktex", "bin", "x64", `${spec.name}.exe`), path.join(root, "miktex", "bin", `${spec.name}.exe`)],
      ),
      ...spec.common,
    ]
  }
  return spec.common
}

function pathEntries() {
  return (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)
}

function pathExts() {
  if (process.platform !== "win32") return [""]
  return (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
}

function resolveExisting(candidate: string) {
  const resolved = path.resolve(candidate)
  return existsSync(resolved) ? resolved : undefined
}

function findOnPath(executables: string[]) {
  for (const dir of pathEntries()) {
    for (const executable of executables) {
      const hasExt = Boolean(path.extname(executable))
      const variants = hasExt ? [executable] : [executable, ...pathExts().map((ext) => `${executable}${ext}`)]
      for (const variant of variants) {
        const candidate = path.join(dir, variant)
        if (existsSync(candidate)) return path.resolve(candidate)
      }
    }
  }
  return undefined
}

export function discoverInitTools(configLinks: Record<string, string> = {}): ToolDiscoveryReport {
  const tools = {} as Record<InitToolName, ToolDiscoveryState>
  for (const spec of SPECS) {
    const linked = configLinks[spec.name]
    const env = process.env[spec.env]
    const fromConfig = linked ? resolveExisting(linked) : undefined
    const fromEnv = env ? resolveExisting(env) : undefined
    const fromPath = findOnPath(spec.executables)
    const fromCommon = commonInstallPaths(spec).map(resolveExisting).find(Boolean)
    const candidate = fromConfig ?? fromEnv ?? fromPath ?? fromCommon
    if (candidate) {
      tools[spec.name] = {
        name: spec.name,
        role: spec.role,
        status: "available",
        path: candidate,
        source: fromConfig ? "config" : fromEnv ? "env" : fromPath ? "path" : "common",
      }
    } else {
      tools[spec.name] = {
        name: spec.name,
        role: spec.role,
        status: "missing",
        message: `Checked config link, ${spec.env}, PATH, and common install locations.`,
      }
    }
  }
  return { tools }
}
