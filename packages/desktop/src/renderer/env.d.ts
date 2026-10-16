import type { ElectronAPI } from "../preload/types"

declare global {
  interface Window {
    api: ElectronAPI
    __PAPERCODE__?: {
      deepLinks?: string[]
    }
    __OPENCODE__?: {
      deepLinks?: string[]
    }
  }
}
