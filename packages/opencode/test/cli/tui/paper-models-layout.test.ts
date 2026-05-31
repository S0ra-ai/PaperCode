import { describe, expect, test } from "bun:test"
import {
  PAPER_MODEL_FOOTER_COMPACT,
  PAPER_MODEL_FOOTER_FULL,
  paperModelWorkbenchLayout,
} from "../../../src/cli/cmd/tui/util/paper-models-layout"

describe("Paper Fucker model workbench layout", () => {
  test("keeps the minimum supported terminal usable", () => {
    const layout = paperModelWorkbenchLayout({ columns: 96, rows: 28 })

    expect(layout.outerPaddingX).toBe(1)
    expect(layout.navWidth).toBeLessThanOrEqual(18)
    expect(layout.showDetail).toBe(false)
    expect(layout.detailWidth).toBe(0)
    expect(layout.mainWidth).toBeGreaterThanOrEqual(36)
    expect(layout.rowTextWidth).toBeGreaterThanOrEqual(24)
    expect(layout.listHeight).toBeGreaterThanOrEqual(6)
    expect(layout.footerMode).toBe("compact")
  })

  test("uses compact controls at the recommended terminal size", () => {
    const layout = paperModelWorkbenchLayout({ columns: 120, rows: 34 })

    expect(layout.outerPaddingX).toBe(3)
    expect(layout.navWidth).toBe(22)
    expect(layout.showDetail).toBe(false)
    expect(layout.listHeight).toBeGreaterThanOrEqual(12)
    expect(layout.footerMode).toBe("compact")
    expect(PAPER_MODEL_FOOTER_COMPACT).toContain("↑↓ 滚动")
  })

  test("shows the detail column and full shortcuts on wide terminals", () => {
    const layout = paperModelWorkbenchLayout({ columns: 220, rows: 40 })

    expect(layout.navWidth).toBe(30)
    expect(layout.showDetail).toBe(true)
    expect(layout.detailWidth).toBe(40)
    expect(layout.mainWidth).toBeGreaterThanOrEqual(136)
    expect(layout.footerMode).toBe("full")
    expect(PAPER_MODEL_FOOTER_FULL).toContain("D 删除 provider")
    expect(PAPER_MODEL_FOOTER_FULL).toContain("X 清空全部")
  })
})
