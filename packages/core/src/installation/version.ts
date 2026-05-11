declare global {
  const OPENCODE_VERSION: string
  const OPENCODE_CHANNEL: string
  const PAPER_FUCKER_VERSION: string
}

export const InstallationVersion = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
export const ProductVersion = typeof PAPER_FUCKER_VERSION === "string" ? PAPER_FUCKER_VERSION : InstallationVersion
export const InstallationChannel = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
