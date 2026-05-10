import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { UI } from "../../src/cli/ui"

const root = path.resolve(import.meta.dir, "../..")

async function source(file: string) {
  return fs.readFile(path.join(root, "src", file), "utf8")
}

describe("public Paper Fucker surface", () => {
  test("CLI logo exposes Paper Fucker wordmark", () => {
    const rendered = UI.logo()

    expect(rendered).toContain("Paper Fucker")
    expect(rendered).not.toMatch(/Open\s*Code|OpenCode/)
  })

  test("default CLI command registry hides legacy OpenCode product surfaces", async () => {
    const index = await source("index.ts")
    const forbiddenCommands = [
      "AcpCommand",
      "AgentCommand",
      "ConsoleCommand",
      "DbCommand",
      "GenerateCommand",
      "GithubCommand",
      "ImportCommand",
      "PrCommand",
      "SessionCommand",
      "StatsCommand",
      "UpgradeCommand",
      "UninstallCommand",
    ]

    for (const command of forbiddenCommands) {
      expect(index).not.toContain(`.command(${command})`)
    }
  })

  test("public CLI help strings use PaperRun and hide legacy chat/session wording", async () => {
    const thread = await source("cli/cmd/tui/thread.ts")
    const attach = await source("cli/cmd/tui/attach.ts")
    const run = await source("cli/cmd/run.ts")
    const exportCommand = await source("cli/cmd/export.ts")

    for (const text of [thread, attach, run, exportCommand]) {
      expect(text).not.toContain("continue the last session")
      expect(text).not.toContain("session id to continue")
      expect(text).not.toContain("agent to use")
      expect(text).not.toContain("fork the session")
    }

    expect(exportCommand).toContain('command: "export [runID]"')
    expect(exportCommand).toContain('describe: "export a PaperRun bundle as JSON"')
    expect(exportCommand).not.toContain("export session data as JSON")
    expect(exportCommand).not.toContain("session id to export")
  })

  test("TUI home tips are paper workbench oriented", async () => {
    const tips = await source("cli/cmd/tui/feature-plugins/home/tips-view.tsx")

    expect(tips).toContain("PaperRun")
    expect(tips).toContain("Claim Ledger")
    expect(tips).toContain("paper_fucker export <run-id>")
    expect(tips).not.toContain("paper_fucker preview <run-id>")
    expect(tips).not.toContain("paper_fucker run --code")
    expect(tips).not.toContain("resume the last session")
    expect(tips).not.toContain("conversation session")
    expect(tips).not.toContain("github install")
    expect(tips).not.toContain("agent create")
  })
})
