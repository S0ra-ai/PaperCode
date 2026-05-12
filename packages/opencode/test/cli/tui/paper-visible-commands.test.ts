import { describe, expect, test } from "bun:test"
import { isPaperVisibleCommandOption } from "../../../src/cli/cmd/tui/component/dialog-command"
import { isPaperVisibleSlashCommand, PaperVisibleCommandRegistry } from "../../../src/cli/cmd/tui/paper-visible-commands"

describe("Paper Fucker visible command surface", () => {
  test("keeps only the PaperRun command set plus basic TUI support commands visible", () => {
    for (const command of PaperVisibleCommandRegistry) {
      expect(isPaperVisibleSlashCommand(command)).toBe(true)
    }
    expect(isPaperVisibleSlashCommand("models")).toBe(true)
    expect(isPaperVisibleSlashCommand("help")).toBe(true)
    expect(isPaperVisibleSlashCommand("themes")).toBe(true)
    expect(isPaperVisibleSlashCommand("connect")).toBe(false)
    expect(isPaperVisibleSlashCommand("agents")).toBe(false)
    expect(isPaperVisibleSlashCommand("variants")).toBe(false)
  })

  test("filters legacy chat/session/provider commands from the palette", () => {
    expect(
      isPaperVisibleCommandOption({
        title: "Paper Fucker 模型工作台",
        value: "paper.model_workbench",
        category: "Paper",
        slash: { name: "models" },
      }),
    ).toBe(true)
    expect(
      isPaperVisibleCommandOption({
        title: "Export session transcript",
        value: "session.export",
        category: "Session",
        slash: { name: "export" },
      }),
    ).toBe(false)
    expect(
      isPaperVisibleCommandOption({
        title: "OpenCode provider switch",
        value: "provider.switch",
        category: "Provider",
      }),
    ).toBe(false)
    expect(
      isPaperVisibleCommandOption({
        title: "Variant cycle",
        value: "variant.cycle",
        category: "Agent",
      }),
    ).toBe(false)
  })
})
