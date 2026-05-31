export const MIN_TERMINAL_COLUMNS = 96
export const MIN_TERMINAL_ROWS = 28
export const RECOMMENDED_TERMINAL_COLUMNS = 120
export const RECOMMENDED_TERMINAL_ROWS = 34

export type TerminalSize = {
  columns: number
  rows: number
}

export type TerminalCapabilityGuard = TerminalSize & {
  min_columns: number
  min_rows: number
  recommended_columns: number
  recommended_rows: number
  can_render: boolean
}

export function terminalCapabilityGuard(input: TerminalSize): TerminalCapabilityGuard {
  return {
    columns: input.columns,
    rows: input.rows,
    min_columns: MIN_TERMINAL_COLUMNS,
    min_rows: MIN_TERMINAL_ROWS,
    recommended_columns: RECOMMENDED_TERMINAL_COLUMNS,
    recommended_rows: RECOMMENDED_TERMINAL_ROWS,
    can_render: input.columns >= MIN_TERMINAL_COLUMNS && input.rows >= MIN_TERMINAL_ROWS,
  }
}

export function currentTerminalCapability(): TerminalCapabilityGuard {
  return terminalCapabilityGuard({
    columns: process.stdout.columns || RECOMMENDED_TERMINAL_COLUMNS,
    rows: process.stdout.rows || RECOMMENDED_TERMINAL_ROWS,
  })
}

export function terminalTooSmallMessage(state: TerminalCapabilityGuard) {
  return [
    "PaperCode 需要更大的终端窗口才能启动 TUI。",
    `当前尺寸：${state.columns}x${state.rows}`,
    `最低尺寸：${state.min_columns}x${state.min_rows}`,
    `推荐尺寸：${state.recommended_columns}x${state.recommended_rows}`,
    "请放大终端窗口后重新运行 papercode。",
  ].join("\n")
}
