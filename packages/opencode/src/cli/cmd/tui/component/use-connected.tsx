import { createMemo } from "solid-js"
import { useSync } from "@tui/context/sync"
import { isHiddenManagedProvider } from "@tui/util/provider-origin"

export function useConnected() {
  const sync = useSync()
  return createMemo(() =>
    sync.data.provider.some((provider) => !isHiddenManagedProvider(provider.id)),
  )
}
