let currentWorkspacePath: string | undefined
const workspaceTarget = new EventTarget()

export function getPaperConversationWorkspace() {
  return currentWorkspacePath
}

export function setPaperConversationWorkspace(path: string | undefined) {
  currentWorkspacePath = path
  workspaceTarget.dispatchEvent(new Event("paper-conversation-workspace.changed"))
}

export function subscribePaperConversationWorkspace(listener: () => void) {
  const handler = () => listener()
  workspaceTarget.addEventListener("paper-conversation-workspace.changed", handler)
  return () => workspaceTarget.removeEventListener("paper-conversation-workspace.changed", handler)
}
