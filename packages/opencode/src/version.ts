import { ProductVersion } from "@opencode-ai/core/installation/version"

/** The release build defines PAPERCODE_VERSION; a source checkout has no such constant. */
export function parseChangelogVersion(text: string): string | undefined {
  const value = text.match(/^:version\s+(.+)$/m)?.[1]?.trim()
  return value && value.length > 0 ? value : undefined
}

export function resolveProductVersion(changelog?: string): string {
  if (ProductVersion !== "local") return ProductVersion
  const fromChangelog = changelog ? parseChangelogVersion(changelog) : undefined
  return fromChangelog ?? ProductVersion
}

export function localChangelogPath() {
  return new URL("../../../CHANGELOG", import.meta.url)
}
