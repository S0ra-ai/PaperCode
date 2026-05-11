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
    expect(index).toContain(".command(InitCommand)")
  })

  test("user-facing version surfaces follow the product version", async () => {
    const index = await source("index.ts")
    const debug = await source("cli/cmd/debug/index.ts")
    const sidebar = await source("cli/cmd/tui/routes/session/sidebar.tsx")
    const build = await fs.readFile(path.join(root, "script", "build.ts"), "utf8")

    expect(index).toContain('ProductVersion')
    expect(index).toContain('.version("version", "show version number", ProductVersion)')
    expect(debug).toContain("paper_fucker version: ${ProductVersion}")
    expect(sidebar).toContain("{ProductVersion}")
    expect(build).toContain("CHANGELOG")
    expect(build).toContain("PAPER_FUCKER_VERSION")
  })

  test("public CLI help strings use PaperRun and hide legacy chat/session wording", async () => {
    const thread = await source("cli/cmd/tui/thread.ts")
    const attach = await source("cli/cmd/tui/attach.ts")
    const run = await source("cli/cmd/run.ts")
    const exportCommand = await source("cli/cmd/export.ts")
    const initCommand = await source("cli/cmd/init.ts")

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
    expect(initCommand).toContain('command: "init [action]"')
    expect(initCommand).toContain("initialize, inspect, or reset local Paper Fucker state")
    expect(initCommand).toContain("reset")
    expect(initCommand).toContain("doctor")
  })

  test("TUI home tips are paper workbench oriented", async () => {
    const tips = await source("cli/cmd/tui/feature-plugins/home/tips-view.tsx")

    expect(tips).toContain("PaperRun")
    expect(tips).toContain("Claim Ledger")
    expect(tips).toContain("submission_candidate")
    expect(tips).toContain("右侧栏")
    expect(tips).toContain("子 agent 深度由运行态条件停止")
    expect(tips).toContain("paper_fucker export <run-id>")
    expect(tips).not.toContain("paper_fucker preview <run-id>")
    expect(tips).not.toContain("paper_fucker run --code")
    expect(tips).not.toContain("resume the last session")
    expect(tips).not.toContain("conversation session")
    expect(tips).not.toContain("github install")
    expect(tips).not.toContain("agent create")
  })

  test("TUI sidebars and paper API avoid legacy product branding", async () => {
    const sessionSidebar = await source("cli/cmd/tui/routes/session/sidebar.tsx")
    const pluginSidebarFooter = await source("cli/cmd/tui/feature-plugins/sidebar/footer.tsx")
    const paperApi = await source("server/routes/instance/httpapi/groups/paper.ts")

    for (const text of [sessionSidebar, pluginSidebarFooter]) {
      expect(text).toContain("Paper Fucker")
      expect(text).not.toContain("<b>Open</b>")
      expect(text).not.toContain("<b>Code</b>")
    }

    expect(paperApi).toContain("Return provider/model discovery data")
    expect(paperApi).not.toContain("OpenCode provider/model discovery data")
  })

  test("provider connection dialog hides OpenCode subscription products", async () => {
    const providerDialog = await source("cli/cmd/tui/component/dialog-provider.tsx")
    const sessionRoute = await source("cli/cmd/tui/routes/session/index.tsx")
    const retry = await source("session/retry.ts")

    expect(providerDialog).toContain("HIDDEN_SUBSCRIPTION_PROVIDERS")
    expect(providerDialog).not.toContain("Low cost subscription")
    expect(providerDialog).not.toContain("paper_fucker Zen")
    expect(providerDialog).not.toContain("paper_fucker Go")
    expect(sessionRoute).not.toContain("DialogGoUpsell")
    expect(retry).not.toContain("subscribe to Go")
  })
})
