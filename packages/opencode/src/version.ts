import { readFileSync } from "node:fs"
import { ProductVersion as BuildProductVersion } from "@opencode-ai/core/installation/version"

/** The release build defines PAPERCODE_VERSION; a source checkout has no such constant. */
export function parseChangelogVersion(text: string): string | undefined {
  const value = text.match(/^:version\s+(.+)$/m)?.[1]?.trim()
  return value && value.length > 0 ? value : undefined
}

export function resolveProductVersion(changelog?: string): string {
  if (BuildProductVersion !== "local") return BuildProductVersion
  const fromChangelog = changelog ? parseChangelogVersion(changelog) : undefined
  return fromChangelog ?? BuildProductVersion
}

export function localChangelogPath() {
  return new URL("../../../CHANGELOG", import.meta.url)
}

function sourceVersion() {
  try {
    return resolveProductVersion(readFileSync(localChangelogPath(), "utf8"))
  } catch {
    return resolveProductVersion()
  }
}

/**
 * The single version symbol for the CLI, `debug info` and the TUI sidebar. A release binary
 * carries PAPERCODE_VERSION; a source checkout reads the repository CHANGELOG.
 */
export const ProductVersion = sourceVersion()
