import path from "path"
import { existsSync } from "fs"
import { appendResearchEvent, type ResearchRuntimeOptions } from "./run-store"
import { writeResearchArtifact } from "./artifact-store"
import type { ResearchArtifact, ResearchEvent } from "../contracts"
import { withSpan } from "../telemetry"
import { pythonExecutable } from "@/paper/python"

export type PythonBridgeOptions = ResearchRuntimeOptions & {
  python?: string
  pythonPath?: string
  cwd?: string
  env?: Record<string, string | undefined>
}

export type PythonCommandResult = {
  command: string[]
  exit_code: number
  stdout: string
  stderr: string
  json?: unknown
}

export type PythonBridgeRecordedResult = {
  command: PythonCommandResult
  artifact: ResearchArtifact
  event: ResearchEvent
}

export type PythonStructuredToolInput = {
  name: string
  input?: Record<string, unknown>
  artifact_logical_path?: string
}

export type PythonCliToolInput = {
  name: string
  args: string[]
  artifact_logical_path?: string
}

function environment(options?: PythonBridgeOptions) {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  for (const [key, value] of Object.entries(options?.env ?? {})) {
    if (value !== undefined) env[key] = value
  }
  const pythonPath = options?.pythonPath ?? defaultPythonPath(options?.cwd)
  env.PYTHONPATH = env.PYTHONPATH ? `${pythonPath}${path.delimiter}${env.PYTHONPATH}` : pythonPath
  return env
}

function defaultPythonPath(cwd = process.cwd()) {
  const candidates = [
    path.resolve(cwd, "research-tools", "src"),
    path.resolve(cwd, "..", "..", "research-tools", "src"),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!
}

function safeSegment(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "tool"
}

async function readStream(stream: ReadableStream<Uint8Array>) {
  return new Response(stream).text()
}

function parseJson(text: string) {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

export async function runPythonCommand(args: string[], options?: PythonBridgeOptions): Promise<PythonCommandResult> {
  const command = [pythonExecutable(options), ...args]
  return withSpan(
    "research.runtime.python_command",
    {
      "papercode.research.python.command": command.join(" "),
    },
    async (span) => {
      const proc = Bun.spawn(command, {
        cwd: options?.cwd ?? process.cwd(),
        env: environment(options),
        stdout: "pipe",
        stderr: "pipe",
      })
      const [stdout, stderr, exitCode] = await Promise.all([readStream(proc.stdout), readStream(proc.stderr), proc.exited])
      span.setAttribute("papercode.research.python.exit_code", exitCode)
      return {
        command,
        exit_code: exitCode,
        stdout,
        stderr,
        json: parseJson(stdout),
      }
    },
  )
}

async function recordPythonResult(
  runDir: string,
  input: {
    channel: "mcp" | "cli"
    name: string
    command: PythonCommandResult
    artifact_logical_path?: string
  },
  options?: PythonBridgeOptions,
): Promise<PythonBridgeRecordedResult> {
  const status =
    typeof input.command.json === "object" &&
    input.command.json &&
    "status" in input.command.json &&
    typeof (input.command.json as { status?: unknown }).status === "string"
      ? (input.command.json as { status: string }).status
      : input.command.exit_code === 0
        ? "succeeded"
        : "failed"
  const artifact = await writeResearchArtifact(
    runDir,
    {
      kind: "log",
      logical_path:
        input.artifact_logical_path ??
        `python-tools/${input.channel}-${safeSegment(input.name)}-${Date.now().toString(36)}.json`,
      mime_type: "application/json",
      data: {
        channel: input.channel,
        name: input.name,
        status,
        command: input.command.command,
        exit_code: input.command.exit_code,
        stdout: input.command.stdout,
        stderr: input.command.stderr,
        json: input.command.json,
      },
      metadata: {
        tool_channel: input.channel,
        tool_name: input.name,
        exit_code: input.command.exit_code,
      },
    },
    options,
  )
  const event = await appendResearchEvent(
    runDir,
    {
      type: input.channel === "mcp" ? "python.tool" : "python.cli",
      actor: "tool",
      payload: {
        channel: input.channel,
        name: input.name,
        status,
        exit_code: input.command.exit_code,
        artifact_id: artifact.artifact_id,
      },
    },
    options,
  )
  return { command: input.command, artifact, event }
}

export async function callPythonStructuredTool(
  runDir: string,
  input: PythonStructuredToolInput,
  options?: PythonBridgeOptions,
) {
  return withSpan(
    "research.runtime.python_structured_tool",
    {
      "papercode.research.python.tool": input.name,
    },
    async () => {
      const command = await runPythonCommand(
        ["-m", "papercode_tools", "mcp-call", input.name, "--input-json", JSON.stringify(input.input ?? {})],
        options,
      )
      return recordPythonResult(
        runDir,
        {
          channel: "mcp",
          name: input.name,
          command,
          artifact_logical_path: input.artifact_logical_path,
        },
        options,
      )
    },
  )
}

export async function runPythonCliTool(runDir: string, input: PythonCliToolInput, options?: PythonBridgeOptions) {
  return withSpan(
    "research.runtime.python_cli_tool",
    {
      "papercode.research.python.cli": input.name,
    },
    async () => {
      const command = await runPythonCommand(["-m", "papercode_tools", ...input.args], options)
      return recordPythonResult(
        runDir,
        {
          channel: "cli",
          name: input.name,
          command,
          artifact_logical_path: input.artifact_logical_path,
        },
        options,
      )
    },
  )
}
