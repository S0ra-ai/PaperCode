const contains = (consoleManagedProviders: string[] | ReadonlySet<string>, providerID: string) =>
  Array.isArray(consoleManagedProviders)
    ? consoleManagedProviders.includes(providerID)
    : consoleManagedProviders.has(providerID)

export const isConsoleManagedProvider = (consoleManagedProviders: string[] | ReadonlySet<string>, providerID: string) =>
  contains(consoleManagedProviders, providerID)

const HIDDEN_MANAGED_PROVIDERS = new Set(["opencode", "opencode-go"])

export function isHiddenManagedProvider(providerID: string) {
  return HIDDEN_MANAGED_PROVIDERS.has(providerID)
}
