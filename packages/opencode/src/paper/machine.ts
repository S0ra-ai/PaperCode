import { existsSync } from "fs"
import { statfs } from "fs/promises"
import { spawnSync } from "node:child_process"
import os from "os"
import path from "path"
import { homeRunRoot } from "./research/runtime/paths"

export type PaperEnvironmentCapabilityStatus = "available" | "missing" | "optional_missing" | "blocked" | "unknown"

export interface PaperEnvironmentCapability {
  id: string
  label: string
  status: PaperEnvironmentCapabilityStatus
  path?: string
  version?: string
  impact: string
}

export interface PaperGpuDevice {
  vendor: "nvidia" | "amd" | "intel" | "unknown"
  name: string
  driver?: string
  memory_mb?: number
  status: PaperEnvironmentCapabilityStatus
}

export interface PaperMachineProfile {
  schema_version: "PaperMachineProfile.v1"
  captured_at: string
  os: {
    platform: NodeJS.Platform
    release: string
    arch: string
    hostname: string
  }
  cpu: {
    model: string
    cores: number
  }
  memory: {
    total_bytes: number
    free_bytes: number
  }
  disk?: {
    path: string
    total_bytes: number
    free_bytes: number
  }
  workspace: string
  default_run_root: string
  gpu: {
    mode: "gpu" | "cpu-only"
    devices: PaperGpuDevice[]
    cuda: PaperEnvironmentCapability
    rocm: PaperEnvironmentCapability
  }
  compilers: PaperEnvironmentCapability[]
  runtimes: PaperEnvironmentCapability[]
}

export interface PaperExperimentEnvironmentStatus {
  schema_version: "PaperExperimentEnvironmentStatus.v1"
  captured_at: string
  status: PaperEnvironmentCapabilityStatus
  available: PaperEnvironmentCapability[]
  missing: PaperEnvironmentCapability[]
  optional_missing: PaperEnvironmentCapability[]
  blocked: PaperEnvironmentCapability[]
  notes: string[]
}

type ToolSpec = {
  id: string
  label: string
  executables: string[]
  impact: string
  version_args?: string[][]
}

const COMPILER_SPECS: ToolSpec[] = [
  { id: "cl", label: "MSVC cl", executables: ["cl"], impact: "C/C++ Windows extension builds and native baselines may be unavailable.", version_args: [[]] },
  { id: "gcc", label: "gcc", executables: ["gcc"], impact: "C/C++ baselines that expect GCC cannot be compiled locally." },
  { id: "clang", label: "clang", executables: ["clang"], impact: "LLVM/Clang experiment builds cannot run locally." },
  { id: "nvcc", label: "nvcc", executables: ["nvcc"], impact: "CUDA kernels and GPU extension builds cannot be compiled." },
  { id: "cmake", label: "cmake", executables: ["cmake"], impact: "CMake-based reproduction scripts will need manual setup." },
  { id: "ninja", label: "ninja", executables: ["ninja", "ninja-build"], impact: "Ninja-based builds may fall back to slower generators or fail." },
  { id: "make", label: "make", executables: ["make", "mingw32-make", "nmake"], impact: "Makefile-based experiments cannot run directly." },
  { id: "rust", label: "rustc/cargo", executables: ["rustc", "cargo"], impact: "Rust experiment baselines cannot be built." },
  { id: "go", label: "Go", executables: ["go"], impact: "Go baselines and tooling cannot run locally." },
  { id: "java", label: "Java", executables: ["java"], impact: "Java/JVM evaluation harnesses cannot run locally.", version_args: [["-version"]] },
]

const RUNTIME_SPECS: ToolSpec[] = [
  { id: "python", label: "Python", executables: ["python", "python3", "py"], impact: "Python research-tools, notebooks, and data probes are unavailable." },
  { id: "uv", label: "uv", executables: ["uv"], impact: "Python environment bootstrap will use slower fallback tools." },
  { id: "pip", label: "pip", executables: ["pip", "pip3"], impact: "Python package installation needs a different frontend." },
  { id: "conda", label: "conda/mamba", executables: ["conda", "mamba"], impact: "Conda environment reproduction cannot be automated." },
  { id: "node", label: "Node.js", executables: ["node"], impact: "Node-based baselines and renderers cannot run." },
  { id: "bun", label: "Bun", executables: ["bun"], impact: "PaperCode source workflows and JS tests cannot run from Bun." },
  { id: "docker", label: "Docker", executables: ["docker"], impact: "Container reproduction gate is unavailable." },
  { id: "wsl", label: "WSL", executables: ["wsl"], impact: "Linux-only experiment fallback on Windows is unavailable." },
  {
    id: "hyperv",
    label: "Hyper-V",
    executables: ["powershell", "pwsh"],
    impact: "Hyper-V status could not be inspected automatically.",
    version_args: [["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]],
  },
  { id: "virtualbox", label: "VirtualBox", executables: ["VBoxManage"], impact: "VirtualBox-backed reproduction VMs cannot be managed." },
  { id: "vmware", label: "VMware", executables: ["vmrun"], impact: "VMware-backed reproduction VMs cannot be managed." },
]

const GPU_SPECS: ToolSpec[] = [
  { id: "nvidia-smi", label: "NVIDIA GPU", executables: ["nvidia-smi"], impact: "CUDA GPU experiments will run CPU-only." },
  { id: "rocm-smi", label: "AMD ROCm GPU", executables: ["rocm-smi", "rocminfo"], impact: "ROCm GPU experiments will run CPU-only." },
  { id: "intel-gpu", label: "Intel GPU", executables: ["sycl-ls", "intel_gpu_top"], impact: "Intel GPU experiments will run CPU-only." },
]

let cached:
  | {
      profile: PaperMachineProfile
      environment: PaperExperimentEnvironmentStatus
      expires_at: number
    }
  | undefined

function pathEntries() {
  return (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)
}

function pathExts() {
  if (process.platform !== "win32") return [""]
  return (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
}

function findOnPath(executables: string[]) {
  for (const dir of pathEntries()) {
    for (const executable of executables) {
      const variants = path.extname(executable) ? [executable] : [executable, ...pathExts().map((ext) => `${executable}${ext}`)]
      for (const variant of variants) {
        const candidate = path.join(dir, variant)
        if (existsSync(candidate)) return path.resolve(candidate)
      }
    }
  }
  return undefined
}

function compactVersionOutput(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" | ")
    .slice(0, 180)
}

function inspectVersion(executable: string, versionArgs: string[][] = [["--version"]]) {
  for (const args of versionArgs) {
    const result = spawnSync(executable, args, {
      encoding: "utf8",
      timeout: 1500,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    })
    const text = compactVersionOutput(`${result.stdout ?? ""}\n${result.stderr ?? ""}`)
    if (text) return text
  }
  return undefined
}

function inspectTool(spec: ToolSpec): PaperEnvironmentCapability {
  const hit = findOnPath(spec.executables)
  return {
    id: spec.id,
    label: spec.label,
    status: hit ? "available" : "optional_missing",
    path: hit,
    version: hit ? inspectVersion(hit, spec.version_args) : undefined,
    impact: hit ? "已可用" : spec.impact,
  }
}

async function inspectDisk(workspace: string) {
  const stats = await statfs(workspace).catch(() => undefined)
  if (!stats) return undefined
  return {
    path: workspace,
    total_bytes: Number(stats.blocks) * Number(stats.bsize),
    free_bytes: Number(stats.bavail) * Number(stats.bsize),
  }
}

function inspectGpu(): { devices: PaperGpuDevice[]; cuda: PaperEnvironmentCapability; rocm: PaperEnvironmentCapability } {
  const nvidia = inspectTool(GPU_SPECS[0]!)
  const amd = inspectTool(GPU_SPECS[1]!)
  const intel = inspectTool(GPU_SPECS[2]!)
  const devices: PaperGpuDevice[] = []
  if (nvidia.status === "available") devices.push({ vendor: "nvidia", name: "NVIDIA GPU", status: "available" })
  if (amd.status === "available") devices.push({ vendor: "amd", name: "AMD GPU", status: "available" })
  if (intel.status === "available") devices.push({ vendor: "intel", name: "Intel GPU", status: "available" })
  return {
    devices,
    cuda: {
      id: "cuda",
      label: "CUDA",
      status: nvidia.status === "available" ? "available" : "optional_missing",
      path: nvidia.path,
      impact: nvidia.status === "available" ? "NVIDIA CUDA 工具链可检测。" : "缺失时 CUDA 实验降级为 CPU-only。",
    },
    rocm: {
      id: "rocm",
      label: "ROCm",
      status: amd.status === "available" ? "available" : "optional_missing",
      path: amd.path,
      impact: amd.status === "available" ? "AMD ROCm 工具链可检测。" : "缺失时 ROCm 实验降级为 CPU-only。",
    },
  }
}

function createEnvironmentStatus(profile: PaperMachineProfile): PaperExperimentEnvironmentStatus {
  const capabilities = [...profile.compilers, ...profile.runtimes, profile.gpu.cuda, profile.gpu.rocm]
  const available = capabilities.filter((item) => item.status === "available")
  const blocked = capabilities.filter((item) => item.status === "blocked")
  const missing = capabilities.filter((item) => item.status === "missing")
  const optionalMissing = capabilities.filter((item) => item.status === "optional_missing")
  return {
    schema_version: "PaperExperimentEnvironmentStatus.v1",
    captured_at: profile.captured_at,
    status: blocked.length > 0 ? "blocked" : "available",
    available,
    missing,
    optional_missing: optionalMissing,
    blocked,
    notes: [
      profile.gpu.mode === "cpu-only" ? "未检测到 GPU 管理工具，实验默认 CPU-only。" : "已检测到 GPU 管理工具。",
      optionalMissing.length > 0 ? "可选缺失只影响对应实验、导出或复现能力，不阻止基础论文工作台启动。" : "基础实验工具链检测正常。",
    ],
  }
}

export async function inspectPaperMachineProfile(options: { home?: string; workspace?: string; refresh?: boolean } = {}) {
  if (!options.refresh && cached && cached.expires_at > Date.now()) return cached
  const workspace = path.resolve(options.workspace ?? process.cwd())
  const captured = new Date().toISOString()
  const gpu = inspectGpu()
  const profile: PaperMachineProfile = {
    schema_version: "PaperMachineProfile.v1",
    captured_at: captured,
    os: {
      platform: process.platform,
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
    },
    cpu: {
      model: os.cpus()[0]?.model ?? "unknown",
      cores: os.cpus().length,
    },
    memory: {
      total_bytes: os.totalmem(),
      free_bytes: os.freemem(),
    },
    disk: await inspectDisk(workspace),
    workspace,
    default_run_root: homeRunRoot(options.home),
    gpu: {
      mode: gpu.devices.length > 0 ? "gpu" : "cpu-only",
      devices: gpu.devices,
      cuda: gpu.cuda,
      rocm: gpu.rocm,
    },
    compilers: COMPILER_SPECS.map(inspectTool),
    runtimes: RUNTIME_SPECS.map(inspectTool),
  }
  cached = {
    profile,
    environment: createEnvironmentStatus(profile),
    expires_at: Date.now() + 30_000,
  }
  return cached
}

