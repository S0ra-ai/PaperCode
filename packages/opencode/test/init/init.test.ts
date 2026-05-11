import { describe, expect, test } from "bun:test"
import { existsSync } from "fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import os from "os"
import path from "path"
import { diagnoseInit, initPaths, readSecrets, resetInitState, runInitWizard } from "@/paper/init"
import { formatDoctorResult, formatInitResult } from "@/paper/init/format"

async function clean(dir: string, attempts = 30): Promise<void> {
  Bun.gc(true)
  await sleep(100)
  return rm(dir, { recursive: true, force: true }).catch((error) => {
    if (attempts <= 1) throw error
    return clean(dir, attempts - 1)
  })
}

describe("init wizard", () => {
  test("uses bounded access by default so first-run init works without Full Access acknowledgement", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-init-default-"))
    try {
      const result = await runInitWizard({ home: dir })

      expect(result.config.access.mode).toBe("bounded")
      expect(result.config.access.bounded_hours).toBe(24)
      expect(result.config.access.full_access_acknowledged).toBe(false)
      expect(result.config.language.default).toBe("zh-CN")
      expect(result.config.models.default_endpoint).toBe("deepseek")
      expect(result.config.models.endpoints).toContainEqual({
        name: "deepseek",
        base_url: "https://api.deepseek.com/v1",
        model: "deepseek-v4-pro",
        api_key_secret: "DEEPSEEK_API_KEY",
      })
    } finally {
      await clean(dir)
    }
  })

  test("formats init and doctor output as Chinese summaries by default", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-init-format-"))
    try {
      const result = await runInitWizard({ home: dir })
      const initText = formatInitResult(result)
      const doctorText = formatDoctorResult(await diagnoseInit(dir))

      expect(initText).toContain("Paper Fucker 初始化完成")
      expect(initText).toContain("配置目录:")
      expect(initText).toContain("Provider: deepseek -> deepseek-v4-pro")
      expect(initText.trimStart().startsWith("{")).toBe(false)
      expect(doctorText).toContain("Paper Fucker Doctor")
      expect(doctorText).toContain("配置文件: 已存在")
      expect(doctorText).toContain("需要完整机器可读诊断时，加 --json")
      expect(doctorText.trimStart().startsWith("{")).toBe(false)
    } finally {
      await clean(dir)
    }
  })

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

  test("backs up and resets only global plus ignored workspace state", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-reset-home-"))
    const workspace = await mkdtemp(path.join(os.tmpdir(), "paper-fucker-reset-workspace-"))
    try {
      const globalRoot = path.join(home, ".paper_fucker")
      const workspaceRoot = path.join(workspace, ".paper_fucker")
      const localDir = path.join(workspaceRoot, "local")
      const runsDir = path.join(workspaceRoot, "runs")
      const trackedSkillDir = path.join(workspaceRoot, "skills", "nature-paper")
      await mkdir(globalRoot, { recursive: true })
      await mkdir(localDir, { recursive: true })
      await mkdir(path.join(runsDir, "run-1"), { recursive: true })
      await mkdir(trackedSkillDir, { recursive: true })
      await writeFile(path.join(globalRoot, "config.json"), "{}")
      await writeFile(path.join(localDir, "provider-secrets.json"), "{}")
      await writeFile(path.join(runsDir, "run-1", "snapshot.json"), "{}")
      await writeFile(path.join(trackedSkillDir, "SKILL.md"), "# Nature")

      const result = await resetInitState({
        home,
        workspace,
        scope: "all",
        backup: true,
        yes: true,
        now: new Date("2026-05-11T00:00:00Z"),
      })

      expect(result.backup_dir).toBe(path.join(home, ".paper_fucker_backups", "20260511T000000Z"))
      expect(existsSync(globalRoot)).toBe(false)
      expect(existsSync(localDir)).toBe(false)
      expect(existsSync(runsDir)).toBe(false)
      expect(existsSync(trackedSkillDir)).toBe(true)
      expect(existsSync(path.join(result.backup_dir!, "global", "config.json"))).toBe(true)
      expect(existsSync(path.join(result.backup_dir!, "workspace-local", "provider-secrets.json"))).toBe(true)
      expect(existsSync(path.join(result.backup_dir!, "workspace-runs", "run-1", "snapshot.json"))).toBe(true)
    } finally {
      await clean(home)
      await clean(workspace)
    }
  })

  test("reset requires explicit confirmation", async () => {
    await expect(resetInitState({ yes: false })).rejects.toThrow(/--yes/)
  })
})
