import { describe, expect, test } from "bun:test"
import {
  MIN_TERMINAL_COLUMNS,
  MIN_TERMINAL_ROWS,
  RECOMMENDED_TERMINAL_COLUMNS,
  RECOMMENDED_TERMINAL_ROWS,
  terminalCapabilityGuard,
  terminalTooSmallMessage,
} from "../../../src/cli/cmd/tui/util/terminal-size"
import { displayWidth, truncateDisplayMiddle } from "../../../src/cli/cmd/tui/util/text-width"

describe("Paper Fucker terminal utilities", () => {
  test("blocks undersized terminals before rendering the full TUI", () => {
    const blocked = terminalCapabilityGuard({ columns: 80, rows: 24 })

    expect(blocked.can_render).toBe(false)
    expect(blocked.min_columns).toBe(MIN_TERMINAL_COLUMNS)
    expect(blocked.min_rows).toBe(MIN_TERMINAL_ROWS)
    expect(blocked.recommended_columns).toBe(RECOMMENDED_TERMINAL_COLUMNS)
    expect(blocked.recommended_rows).toBe(RECOMMENDED_TERMINAL_ROWS)
    expect(terminalTooSmallMessage(blocked)).toContain("最低尺寸")
  })

  test("allows the minimum terminal size", () => {
    expect(terminalCapabilityGuard({ columns: 96, rows: 28 }).can_render).toBe(true)
  })

  test("truncates mixed Chinese and Windows paths by display width", () => {
    const value = "E:\\Project\\中文论文材料\\very-long-folder\\paper_fucker"
    const truncated = truncateDisplayMiddle(value, 24)

    expect(displayWidth("中文AB")).toBe(6)
    expect(displayWidth(truncated)).toBeLessThanOrEqual(24)
    expect(truncated).toContain("…")
    expect(truncated.startsWith("E:\\")).toBe(true)
  })
})
