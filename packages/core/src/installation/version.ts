declare global {
  const OPENCODE_VERSION: string
  const OPENCODE_CHANNEL: string
  const PAPERCODE_VERSION: string
}

export const InstallationVersion = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
export const ProductVersion = typeof PAPERCODE_VERSION === "string" ? PAPERCODE_VERSION : InstallationVersion
export const InstallationChannel = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
