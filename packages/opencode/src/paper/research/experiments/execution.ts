import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExperimentCommand, ExperimentMetric, ExperimentProtocol } from "./schemas"

export async function loadExperimentProtocol(workspace: string): Promise<ExperimentProtocol | undefined> {
  const filename = path.join(workspace, "experiments", "protocol.json")
  let content: string
  try {
    content = await readFile(filename, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
  const invalid = (reason: string): never => {
    throw new Error(`Invalid experiment protocol ${filename}: ${reason}`)
  }
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    return invalid("invalid JSON")
  }
  if (!value || typeof value !== "object") return invalid("expected object")
  const protocol = value as ExperimentProtocol
  if (
    protocol.schema_version !== "ExperimentProtocol.v1" ||
    !Array.isArray(protocol.entries) ||
    !protocol.entries.length
  )
    return invalid("schema_version or entries")
  if (protocol.metric_direction !== undefined && !["higher_better", "lower_better"].includes(protocol.metric_direction))
    return invalid("metric_direction")
  const ids = new Set<string>()
  for (const entry of protocol.entries) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.protocol_id !== "string" ||
      !entry.protocol_id.trim() ||
      ids.has(entry.protocol_id)
    )
      return invalid("missing or duplicate protocol_id")
    ids.add(entry.protocol_id)
    if (!["proposed", "baseline", "ablation", "container_reproduction"].includes(entry.role))
      return invalid(`invalid role for ${entry.protocol_id}`)
    if (typeof entry.expected_metric !== "string" || !/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(entry.expected_metric))
      return invalid(`invalid expected_metric for ${entry.protocol_id}`)
    if (
      !entry.command ||
      !Array.isArray(entry.command.argv) ||
      !entry.command.argv.length ||
      !entry.command.argv.every((arg) => typeof arg === "string" && arg.length > 0 && !arg.includes("\0"))
    )
      return invalid(`invalid command argv for ${entry.protocol_id}`)
    if (
      entry.target_experiment_id !== undefined &&
      (entry.role !== "container_reproduction" ||
        typeof entry.target_experiment_id !== "string" ||
        !entry.target_experiment_id.trim())
    )
      return invalid(`invalid target_experiment_id for ${entry.protocol_id}`)
    if (entry.command.cwd !== undefined && typeof entry.command.cwd !== "string")
      return invalid(`invalid command cwd for ${entry.protocol_id}`)
    if (
      entry.command.timeout_seconds !== undefined &&
      (!Number.isFinite(entry.command.timeout_seconds) || entry.command.timeout_seconds <= 0)
    )
      return invalid(`invalid command timeout for ${entry.protocol_id}`)
    if (
      entry.command.env !== undefined &&
      (!entry.command.env ||
        typeof entry.command.env !== "object" ||
        Array.isArray(entry.command.env) ||
        !Object.values(entry.command.env).every((item) => typeof item === "string"))
    )
      return invalid(`invalid command env for ${entry.protocol_id}`)
    if (entry.label !== undefined && typeof entry.label !== "string")
      return invalid(`invalid label for ${entry.protocol_id}`)
    if (entry.rationale !== undefined && typeof entry.rationale !== "string")
      return invalid(`invalid rationale for ${entry.protocol_id}`)
  }
  return {
    ...protocol,
    discovered_from: "manifest",
    gaps: Array.isArray(protocol.gaps) ? protocol.gaps : [],
    entries: protocol.entries.map((entry) => ({
      ...entry,
      label: entry.label ?? entry.protocol_id,
      rationale: entry.rationale ?? "Explicit workspace experiment protocol.",
    })),
  }
}

export function selectContainerCommand(
  protocol: ExperimentProtocol | undefined,
  spec: { experiment_id: string },
): ExperimentCommand | undefined {
  const entries = protocol?.entries.filter((entry) => entry.role === "container_reproduction") ?? []
  const bound = entries.filter((entry) => entry.target_experiment_id === spec.experiment_id)
  const generic = entries.filter(
    (entry) => !entry.target_experiment_id && entry.command.argv.some((arg) => arg.includes("{experiment_id}")),
  )
  const selected = bound.length ? bound : generic
  if (selected.length > 1) throw new Error(`Ambiguous container reproduction command for ${spec.experiment_id}`)
  const entry = selected[0]
  if (!entry) return undefined
  return {
    ...entry.command,
    argv: entry.command.argv.map((arg) => arg.replaceAll("{experiment_id}", spec.experiment_id)),
  }
}

type MetricSpec = { experiment_id: string; role: string; label: string }
export function parseExperimentMetrics(stdout: string, spec: MetricSpec, metricName: string): ExperimentMetric[] {
  const parse = (value: unknown): ExperimentMetric[] => {
    if (Array.isArray(value)) {
      const matches = value.filter(
        (item) =>
          item && typeof item === "object" && "experiment_id" in item && item.experiment_id === spec.experiment_id,
      )
      return (matches.length ? matches : value).flatMap(parse)
    }
    if (!value || typeof value !== "object") return []
    const item = value as Record<string, unknown>
    if (typeof item.experiment_id === "string" && item.experiment_id !== spec.experiment_id) return []
    if (item.metrics !== undefined) return parse(item.metrics)
    if (item.metric !== undefined && typeof item.metric !== "string") return parse(item.metric)
    if (item[spec.experiment_id] !== undefined) return parse(item[spec.experiment_id])
    const name = typeof item.name === "string" ? item.name : typeof item.metric === "string" ? item.metric : metricName
    const raw = item.value ?? item[name]
    const number = typeof raw === "string" && raw.trim() ? Number(raw) : raw
    if (typeof number !== "number" || !Number.isFinite(number)) return []
    return [
      {
        name,
        value: number,
        direction: item.direction === "lower_better" ? "lower_better" : "higher_better",
        ...(typeof item.unit === "string" ? { unit: item.unit } : {}),
      },
    ]
  }
  try {
    const metrics = parse(JSON.parse(stdout))
    if (metrics.length) return metrics
  } catch {}
  const metrics: ExperimentMetric[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const payload = line.replace(/^PAPERCODE_METRICS?\s+/, "")
    try {
      metrics.push(...parse(JSON.parse(payload)))
    } catch {}
  }
  if (metrics.length) return metrics
  const escaped = metricName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = stdout.match(
    new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*([-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?)(?=\\s|$)`),
  )
  const value = match ? Number(match[1]) : NaN
  return Number.isFinite(value) ? [{ name: metricName, value, direction: "higher_better" }] : []
}

export type ContainerExecutionResult = {
  stdoutBytes?: number
  stderrBytes?: number
  outputTruncated?: boolean
  startedAt?: string
  finishedAt?: string
  exitCode: number
  stdout: string
  stderr: string
  wallTimeSeconds: number
  timedOut: boolean
  execution?: {
    kind: "process"
    command: ExperimentCommand
    exit_code: number
    container: { runtime: "docker" | "podman"; container_id: string; image_digest: string; isolated: boolean }
  }
}

async function processCommand(
  argv: string[],
  cwd: string,
  timeoutMs: number,
  env?: Record<string, string>,
  shell = false,
): Promise<ContainerExecutionResult> {
  const started = Date.now()
  return new Promise((resolve) => {
    let stdout = "",
      stderr = "",
      timedOut = false,
      settled = false
    let stdoutBytes = 0,
      stderrBytes = 0
    let stdoutTail: Buffer = Buffer.alloc(0),
      stderrTail: Buffer = Buffer.alloc(0)
    const limit = 64 * 1024
    const tail = (current: Buffer, bytes: Buffer) => {
      if (bytes.length >= limit) return Buffer.from(bytes.subarray(bytes.length - limit))
      if (!bytes.length) return current
      const retained = current.subarray(Math.max(0, current.length + bytes.length - limit))
      return Buffer.concat([retained, bytes])
    }
    const executable = resolveExecutable(argv[0]!, env)
    const child = spawn(executable, argv.slice(1), {
      cwd,
      shell,
      windowsHide: true,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    })
    const finish = (exitCode: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      stdout = stdoutTail.toString("utf8")
      stderr = stderrTail.toString("utf8") + stderr
      resolve({
        exitCode,
        stdout,
        stderr,
        timedOut,
        wallTimeSeconds: (Date.now() - started) / 1000,
        stdoutBytes,
        stderrBytes,
        outputTruncated: stdoutBytes > limit || stderrBytes > limit,
        startedAt: new Date(started).toISOString(),
        finishedAt: new Date().toISOString(),
      })
    }
    child.stdout?.on("data", (data) => {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data)
      stdoutBytes += bytes.length
      stdoutTail = tail(stdoutTail, bytes)
    })
    child.stderr?.on("data", (data) => {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data)
      stderrBytes += bytes.length
      stderrTail = tail(stderrTail, bytes)
    })
    const timer = setTimeout(
      () => {
        timedOut = true
        child.kill()
        finish(124)
      },
      Math.max(1, timeoutMs),
    )
    child.on("error", (error) => {
      stderr += `\n${error.message}`
      finish(127)
    })
    child.on("close", (code) => finish(code ?? 1))
  })
}

function resolveExecutable(executable: string, env?: Record<string, string>) {
  if (process.platform !== "win32" || executable.toLowerCase() !== "bun") return executable
  // An application compiled with Bun has its own executable; it is not the Bun CLI.
  if (path.basename(process.execPath).toLowerCase() === "bun.exe" && existsSync(process.execPath))
    return process.execPath
  const located = typeof Bun !== "undefined" ? Bun.which("bun") : undefined
  const candidates = [
    typeof Bun !== "undefined" ? Bun.which("bun.exe") : undefined,
    located && path.join(path.dirname(located), "node_modules", "bun", "bin", "bun.exe"),
    (env?.USERPROFILE ?? process.env.USERPROFILE) &&
      path.join(env?.USERPROFILE ?? process.env.USERPROFILE!, ".bun", "bin", "bun.exe"),
  ]
  return candidates.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate))) ?? executable
}

export async function executeHostExperiment(
  command: ExperimentCommand,
  cwd: string,
  timeoutMs: number,
): Promise<ContainerExecutionResult> {
  if (!command.argv.length || command.argv.some((arg) => typeof arg !== "string" || !arg.length || arg.includes("\0")))
    return { exitCode: 127, stdout: "", stderr: "No executable experiment argv is configured.", wallTimeSeconds: 0, timedOut: false }
  return processCommand(
    command.argv,
    command.cwd ? path.resolve(cwd, command.cwd) : cwd,
    timeoutMs,
    command.env,
    command.argv.length === 1,
  )
}

export async function executeContainerExperiment(
  command: ExperimentCommand,
  cwd: string,
  timeoutMs: number,
): Promise<ContainerExecutionResult> {
  const rejected = (stderr: string): ContainerExecutionResult => ({
    exitCode: 2,
    stdout: "",
    stderr,
    wallTimeSeconds: 0,
    timedOut: false,
  })
  const [runtime, action, ...args] = command.argv
  if ((runtime !== "docker" && runtime !== "podman") || action !== "run")
    return rejected("Container evidence requires structured docker/podman run argv.")
  // Conservative allowlist prevents bypasses through aliases and flags whose value consumes the image token.
  const flags = new Set([
    "--network",
    "--net",
    "--pid",
    "--ipc",
    "--uts",
    "--user",
    "-u",
    "--workdir",
    "-w",
    "--env",
    "-e",
    "--volume",
    "-v",
    "--mount",
    "--memory",
    "--cpus",
    "--entrypoint",
    "--name",
    "--label",
    "--security-opt",
    "--cap-drop",
  ])
  const clean: string[] = []
  let imageFound = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (imageFound) {
      clean.push(arg)
      continue
    }
    if (arg === "--rm" || arg === "--rm=true") continue
    if (!arg.startsWith("-")) {
      imageFound = true
      clean.push(arg)
      continue
    }
    const equal = arg.indexOf("=")
    const key = equal < 0 ? arg : arg.slice(0, equal)
    if (!flags.has(key)) return rejected(`Unsupported container run option: ${key}`)
    const value = equal < 0 ? args[++i] : arg.slice(equal + 1)
    if (!value || value.startsWith("-")) return rejected(`Missing container option value: ${key}`)
    if (
      ["--network", "--net", "--pid", "--ipc", "--uts"].includes(key) &&
      (value === "host" || value.startsWith("container:"))
    )
      return rejected(`Non-isolated namespace option: ${key}`)
    if (key === "--security-opt" && /(?:unconfined|label=disable)/.test(value))
      return rejected("Unconfined container security option is unsupported.")
    clean.push(key, value)
  }
  if (!imageFound) return rejected("Container run image is missing.")
  const dir = await mkdtemp(path.join(tmpdir(), "papercode-container-"))
  const cidfile = path.join(dir, "container.cid")
  let id: string | undefined
  try {
    const actual = { ...command, argv: [runtime, "run", "--cidfile", cidfile, ...clean] }
    const result = await processCommand(actual.argv, cwd, timeoutMs, command.env)
    const candidate = (await readFile(cidfile, "utf8").catch(() => "")).trim()
    if (!/^[a-f0-9]{12,64}$/i.test(candidate))
      return { ...result, stderr: `${result.stderr}\nContainer ID could not be verified.`.trim() }
    id = candidate
    const inspected = await processCommand([runtime, "inspect", id], cwd, 10_000, command.env)
    try {
      const details = JSON.parse(inspected.stdout)[0]
      const host = details?.HostConfig
      const state = details?.State
      const image = details?.Image
      const sameID = details?.Id === id
      const isolated = Boolean(
        host &&
          host.Privileged === false &&
          ![host.NetworkMode, host.PidMode, host.IpcMode, host.UTSMode].some(
            (mode) => mode === "host" || (typeof mode === "string" && mode.startsWith("container:")),
          ),
      )
      if (
        inspected.exitCode === 0 &&
        sameID &&
        state?.Running === false &&
        state?.ExitCode === result.exitCode &&
        /^sha256:[a-f0-9]{64}$/i.test(image) &&
        isolated &&
        !result.timedOut
      ) {
        result.execution = {
          kind: "process",
          command: actual,
          exit_code: result.exitCode,
          container: { runtime, container_id: id, image_digest: image, isolated },
        }
      } else
        result.stderr = `${result.stderr}\nContainer inspection did not verify completed isolated execution.`.trim()
    } catch {
      result.stderr = `${result.stderr}\nContainer inspection returned no valid evidence.`.trim()
    }
    return result
  } finally {
    if (id) await processCommand([runtime, "rm", "-f", id], cwd, 10_000, command.env)
    await rm(dir, { recursive: true, force: true })
  }
}
