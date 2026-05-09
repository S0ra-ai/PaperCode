import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { createResearchRun, getResearchRunStatus, type ResearchRuntimeOptions } from "@/paper/research/runtime"
import { callPythonStructuredTool, runPythonCliTool } from "@/paper/research/runtime/python-bridge"

const now = "2026-05-08T00:00:00Z"

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true }).catch((error) => {
    if (attempts <= 1) throw error
    return clean(dir, attempts - 1)
  })
}

function runtimeOptions(workspace: string, home: string): ResearchRuntimeOptions {
  let index = 0
  return {
    workspace,
    home,
    clock: () => new Date(now),
    idFactory: (kind) => `${kind}-${++index}`,
  }
}

describe("python tool bridge", () => {
  test("records structured Python tool and CLI outputs as runtime artifacts and events", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-python-bridge-test-"))
    try {
      const workspace = path.join(dir, "workspace")
      const home = path.join(dir, "home")
      await mkdir(workspace, { recursive: true })
      await mkdir(home, { recursive: true })
      const runtime = runtimeOptions(workspace, home)
      const handle = await createResearchRun({ topic: "python bridge smoke" }, runtime)
      const pythonPath = path.resolve(process.cwd(), "..", "..", "research-tools", "src")

      const structured = await callPythonStructuredTool(
        handle.run_dir,
        {
          name: "tool_diagnostics",
          input: {},
          artifact_logical_path: "python-tools/diagnostics-mcp.json",
        },
        { ...runtime, pythonPath },
      )
      expect(structured.command.exit_code).toBe(0)
      expect((structured.command.json as { tool_name?: string }).tool_name).toBe("tool_diagnostics")

      const cli = await runPythonCliTool(
        handle.run_dir,
        {
          name: "diagnostics",
          args: ["diagnostics", "--json"],
          artifact_logical_path: "python-tools/diagnostics-cli.json",
        },
        { ...runtime, pythonPath },
      )
      expect(cli.command.exit_code).toBe(0)

      const status = await getResearchRunStatus(handle.run_dir)
      expect(status.counts.artifacts).toBe(2)
      expect(status.counts.events).toBeGreaterThanOrEqual(5)
      expect(status.artifact_versions.map((item) => item.logical_path).sort()).toEqual([
        "python-tools/diagnostics-cli.json",
        "python-tools/diagnostics-mcp.json",
      ])
    } finally {
      await clean(dir)
    }
  })
})
