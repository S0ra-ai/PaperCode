import { describe, expect, test } from "bun:test"
import { existsSync } from "fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { diagnoseInit, initPaths, readSecrets, runInitWizard } from "@/paper/init"

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true }).catch((error) => {
    if (attempts <= 1) throw error
    return clean(dir, attempts - 1)
  })
}

describe("init wizard", () => {
  test("writes config, linked tools, encrypted secrets, and diagnostics under ~/.paper_fucker", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-init-test-"))
    try {
      const fakePandoc = path.join(dir, process.platform === "win32" ? "pandoc.exe" : "pandoc")
      await writeFile(fakePandoc, "")
      const workspace = path.join(dir, "workspace")
      await mkdir(workspace, { recursive: true })

      const result = await runInitWizard({
        home: dir,
        workspace,
        tool_links: {
          pandoc: fakePandoc,
        },
        secrets: {
          OPENAI_API_KEY: "sk-test-secret",
        },
        secrets_passphrase: "test-passphrase",
        access: {
          mode: "full_access",
          full_access_acknowledged: true,
        },
        budgets: {
          total_soft_usd: 12,
        },
      })

      const paths = initPaths(dir)
      expect(result.paths.config).toBe(paths.config)
      expect(existsSync(paths.config)).toBe(true)
      expect(existsSync(paths.tools)).toBe(true)
      expect(existsSync(paths.secrets)).toBe(true)
      expect(result.config.access.full_access_acknowledged).toBe(true)
      expect(result.config.workspace.default_root).toBe(workspace)
      expect(result.config.model_roles.default_model).toBe("deepseek/deepseek-v4-pro")
      expect(result.config.model_roles.strategy).toBe("opencode_provider_agnostic")
      expect(result.tools.tools.pandoc.status).toBe("available")
      expect(result.tools.tools.pandoc.source).toBe("config")

      const configText = await readFile(paths.config, "utf8")
      const secretsText = await readFile(paths.secrets, "utf8")
      expect(configText).not.toContain("sk-test-secret")
      expect(secretsText).not.toContain("sk-test-secret")
      expect(await readSecrets(paths, "test-passphrase")).toEqual({
        OPENAI_API_KEY: "sk-test-secret",
      })

      const diagnostics = await diagnoseInit(dir)
      expect(diagnostics.config_exists).toBe(true)
      expect(diagnostics.secrets_exists).toBe(true)
      expect(diagnostics.tools.tools.pandoc.status).toBe("available")
    } finally {
      await clean(dir)
    }
  })

  test("requires explicit Full Access acknowledgement", async () => {
    await expect(
      runInitWizard({
        home: os.tmpdir(),
        access: {
          mode: "full_access",
          full_access_acknowledged: false,
        },
      }),
    ).rejects.toThrow(/Full Access/)
  })
})
