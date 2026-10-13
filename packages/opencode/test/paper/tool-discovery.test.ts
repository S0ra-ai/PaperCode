import { describe, expect, test } from "bun:test"
import path from "path"
import { discoverInitTools } from "@/paper/init/discovery"
import { tmpdir } from "../fixture/fixture"

describe("paper tool discovery", () => {
  test.skipIf(process.platform !== "win32")("finds user Pandoc and MiKTeX outside PATH", async () => {
    await using tmp = await tmpdir()
    const local = path.join(tmp.path, "Local")
    const roaming = path.join(tmp.path, "Roaming")
    const pandoc = path.join(local, "Pandoc", "pandoc.exe")
    const xelatex = path.join(local, "Programs", "MiKTeX", "miktex", "bin", "x64", "xelatex.exe")
    const latexmk = path.join(roaming, "MiKTeX", "miktex", "bin", "x64", "latexmk.exe")
    for (const file of [pandoc, xelatex, latexmk]) await Bun.write(file, "fixture executable")
    const changed = ["PATH", "LOCALAPPDATA", "APPDATA", "PAPER_FUCKER_TOOL_PANDOC", "PAPER_FUCKER_TOOL_XELATEX", "PAPER_FUCKER_TOOL_LATEXMK"]
    const saved = Object.fromEntries(changed.map((key) => [key, process.env[key]]))
    try {
      process.env.PATH = ""
      process.env.LOCALAPPDATA = local
      process.env.APPDATA = roaming
      for (const key of changed.filter((key) => key.startsWith("PAPER_FUCKER_TOOL_"))) delete process.env[key]
      const report = discoverInitTools()
      expect(report.tools.pandoc).toMatchObject({ status: "available", path: pandoc, source: "common" })
      expect(report.tools.xelatex).toMatchObject({ status: "available", path: xelatex, source: "common" })
      expect(report.tools.latexmk).toMatchObject({ status: "available", path: latexmk, source: "common" })
    } finally {
      for (const key of changed) {
        if (saved[key] === undefined) delete process.env[key]
        else process.env[key] = saved[key]
      }
    }
  })

  test("invalid saved links fall back to the configured environment tool", async () => {
    await using tmp = await tmpdir()
    const executable = path.join(tmp.path, "pandoc.exe")
    await Bun.write(executable, "fixture executable")
    const previous = process.env.PAPER_FUCKER_TOOL_PANDOC
    try {
      process.env.PAPER_FUCKER_TOOL_PANDOC = executable
      const report = discoverInitTools({ pandoc: path.join(tmp.path, "missing.exe") })
      expect(report.tools.pandoc).toMatchObject({ path: executable, source: "env" })
    } finally {
      if (previous === undefined) delete process.env.PAPER_FUCKER_TOOL_PANDOC
      else process.env.PAPER_FUCKER_TOOL_PANDOC = previous
    }
  })
})
