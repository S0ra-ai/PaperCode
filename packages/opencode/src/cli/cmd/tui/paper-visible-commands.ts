export const PaperVisibleCommandRegistry = [
  "models",
  "status",
  "file",
  "folder",
  "data",
  "log",
  "preview",
  "export",
  "stop",
  "resume",
] as const

export type PaperVisibleCommand = (typeof PaperVisibleCommandRegistry)[number]

export function isPaperVisibleCommand(command: string): command is PaperVisibleCommand {
  return PaperVisibleCommandRegistry.includes(command as PaperVisibleCommand)
}
