import { useGlobalSync } from "@/context/global-sync"
import { decode64 } from "@/utils/base64"
import { useParams } from "@solidjs/router"
import { createMemo } from "solid-js"

export const popularProviders = [
  "anthropic",
  "github-copilot",
  "openai",
  "google",
  "openrouter",
  "vercel",
]
const popularProviderSet = new Set(popularProviders)
const hiddenSubscriptionProviderSet = new Set(["opencode", "opencode-go"])

export function useProviders() {
  const globalSync = useGlobalSync()
  const params = useParams()
  const dir = createMemo(() => decode64(params.dir) ?? "")
  const providers = () => {
    if (dir()) {
      const [projectStore] = globalSync.child(dir())
      if (projectStore.provider_ready) return projectStore.provider
    }
    return globalSync.data.provider
  }
  const visible = () => providers().all.filter((p) => !hiddenSubscriptionProviderSet.has(p.id))
  return {
    all: visible,
    default: () => providers().default,
    popular: () => visible().filter((p) => popularProviderSet.has(p.id)),
    connected: () => {
      const connected = new Set(providers().connected)
      return visible().filter((p) => connected.has(p.id))
    },
    paid: () => {
      const connected = new Set(providers().connected)
      return visible().filter((p) => connected.has(p.id))
    },
  }
}
