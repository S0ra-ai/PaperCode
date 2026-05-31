export type PaperModelWorkbenchLayout = {
  columns: number
  rows: number
  outerPaddingX: number
  navWidth: number
  detailWidth: number
  showDetail: boolean
  mainWidth: number
  rowTextWidth: number
  listHeight: number
  footerMode: "compact" | "full"
}

export const PAPER_MODEL_FOOTER_FULL = [
  "Tab 切换",
  "Enter/Space 选择",
  "A 全选",
  "N 清空",
  "M 主模型",
  "B 设备用",
  "D 删除 provider",
  "X 清空全部",
  "Ctrl+S 保存",
] as const

export const PAPER_MODEL_FOOTER_COMPACT = [
  "Tab 分页",
  "↑↓ 滚动",
  "Space 勾选",
  "M/B 主备",
  "Ctrl+S 保存",
] as const

export function paperModelWorkbenchLayout(input: { columns: number; rows: number }): PaperModelWorkbenchLayout {
  const columns = Math.max(1, Math.floor(input.columns))
  const rows = Math.max(1, Math.floor(input.rows))
  const outerPaddingX = columns < 110 ? 1 : 3
  const navWidth = columns < 110 ? 18 : columns < 128 ? 22 : 30
  const detailWidth = columns >= 150 ? 40 : 0
  const showDetail = detailWidth > 0
  const mainWidth = Math.max(36, columns - outerPaddingX * 2 - navWidth - detailWidth - 8)
  const rowTextWidth = Math.max(24, mainWidth - 30)
  const listHeight = Math.max(6, rows - (rows < 34 ? 19 : 18))
  return {
    columns,
    rows,
    outerPaddingX,
    navWidth,
    detailWidth,
    showDetail,
    mainWidth,
    rowTextWidth,
    listHeight,
    footerMode: mainWidth >= 112 ? "full" : "compact",
  }
}
