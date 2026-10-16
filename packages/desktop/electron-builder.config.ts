import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const signScript = path.join(rootDir, "script", "sign-windows.ps1")

async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return
  if (process.env.GITHUB_ACTIONS !== "true") return

  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", signScript, configuration.path],
    { cwd: rootDir },
  )
}

const hasAppleCredentials = Boolean(
  process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID,
)

const channel = (() => {
  const raw = process.env.PAPERCODE_CHANNEL ?? process.env.OPENCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

// Packaging normally downloads the Electron distribution; ELECTRON_DIST points it at an already
// unpacked one (node_modules/electron/dist) so a machine behind a slow or blocked GitHub can build.
const electronDist = process.env.ELECTRON_DIST

// The channel belongs in the file name. dev, beta and prod builds of the same version otherwise emit
// identical names, and the GitHub publisher overwrites same-named assets of a release, so the last
// channel built would replace the others - and every channel's update metadata would point at it.
// Production keeps the plain name: it is the one users download by name.
const artifactName = ["papercode-desktop", ...(channel === "prod" ? [] : [channel]), "${os}-${arch}.${ext}"].join(
  "-",
)

const getBase = (): Configuration => ({
  artifactName,
  ...(electronDist ? { electronDist } : {}),
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  files: ["out/**/*", "resources/**/*"],
  extraResources: [
    // The main process loads its window and dock icons from process.resourcesPath/icons when
    // packaged, so the icon set has to leave the asar and land in Contents/Resources.
    {
      from: "resources/icons",
      to: "icons",
      filter: ["icon.png", "icon.icns", "icon.ico", "dock.png"],
    },
  ],
  mac: {
    category: "public.app-category.developer-tools",
    icon: `resources/icons/icon.icns`,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    // Notarization needs an Apple Developer ID plus APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID.
    // Without them a local `package:mac` must still produce a runnable (ad-hoc signed) app instead of
    // failing, so it is only requested when the credentials are present.
    notarize: hasAppleCredentials,
    target: ["dmg", "zip"],
  },
  dmg: {
    // A DMG can only be signed with a Developer ID; unsigned local builds keep the default.
    sign: hasAppleCredentials,
  },
  protocols: {
    name: "papercode",
    schemes: ["papercode"],
  },
  win: {
    icon: `resources/icons/icon.ico`,
    signtoolOptions: {
      sign: signWindows,
    },
    target: ["nsis"],
    verifyUpdateCodeSignature: false,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: `resources/icons/icon.ico`,
    installerHeaderIcon: `resources/icons/icon.ico`,
  },
  linux: {
    icon: `resources/icons`,
    category: "Development",
    target: ["AppImage", "deb", "rpm"],
  },
})

function getConfig() {
  const base = getBase()

  switch (channel) {
    case "dev": {
      return {
        ...base,
        appId: "ai.papercode.desktop.dev",
        productName: "papercode Dev",
        rpm: { packageName: "papercode-dev" },
      }
    }
    case "beta": {
      return {
        ...base,
        appId: "ai.papercode.desktop.beta",
        productName: "papercode Beta",
        protocols: { name: "papercode Beta", schemes: ["papercode"] },
        publish: { provider: "github", owner: "S0ra-ai", repo: "PaperCode", channel: "beta" },
        rpm: { packageName: "papercode-beta" },
      }
    }
    case "prod": {
      return {
        ...base,
        appId: "ai.papercode.desktop",
        productName: "papercode",
        protocols: { name: "papercode", schemes: ["papercode"] },
        publish: { provider: "github", owner: "S0ra-ai", repo: "PaperCode", channel: "latest" },
        rpm: { packageName: "papercode" },
      }
    }
  }
}

export default getConfig()
