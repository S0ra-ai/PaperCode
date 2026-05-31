#!/usr/bin/env bun

import { chmod, copyFile, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, "..")
const opencodeDir = path.join(repoRoot, "packages", "opencode")

const platformMap: Record<string, string> = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
}

const archMap: Record<string, string> = {
  arm64: "arm64",
  x64: "x64",
}

const platform = platformMap[process.platform] ?? process.platform
const arch = archMap[process.arch] ?? process.arch
const packageName = `paper_fucker-${platform}-${arch}`
const binDir = path.join(opencodeDir, "dist", packageName, "bin")

const sourceNames = process.platform === "win32" ? ["paper_fucker.exe", "paper_fucker"] : ["paper_fucker"]
const targetNames =
  process.platform === "win32" ? ["papercode.exe", "paper_fucker.exe"] : ["papercode", "paper_fucker"]

async function exists(file: string) {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

let source: string | undefined
for (const name of sourceNames) {
  const candidate = path.join(binDir, name)
  if (await exists(candidate)) {
    source = candidate
    break
  }
}

if (!source) {
  const searched = sourceNames.map((name) => path.join(binDir, name)).join(", ")
  console.error(`Could not find compiled paper_fucker binary for ${platform}/${arch}.`)
  console.error(`Searched: ${searched}`)
  console.error("Run `bun run --cwd packages/opencode build --single` first, or run `bun run build` from the repo root.")
  process.exit(1)
}

for (const targetName of targetNames) {
  const target = path.join(repoRoot, targetName)
  await copyFile(source, target)
  if (process.platform !== "win32") {
    await chmod(target, 0o755)
  }
  console.log(`Linked root executable: ${path.relative(repoRoot, target)} -> ${path.relative(repoRoot, source)}`)
}
