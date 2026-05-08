import type { ElectronAPI } from "../preload/types"

declare global {
  interface Window {
    api: ElectronAPI
    __PAPER_FUCKER__?: {
      deepLinks?: string[]
    }
    __OPENCODE__?: {
      deepLinks?: string[]
    }
  }
}
