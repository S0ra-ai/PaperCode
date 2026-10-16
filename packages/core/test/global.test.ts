import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Global } from "@opencode-ai/core/global"

describe("global paths", () => {
  test("tmp path is under the system temp directory", () => {
    expect(Global.Path.tmp).toBe(path.join(os.tmpdir(), "papercode"))
    expect(Global.make().tmp).toBe(Global.Path.tmp)
  })

  test("tmp path is created on module load", async () => {
    expect((await fs.stat(Global.Path.tmp)).isDirectory()).toBe(true)
  })

  test("ignores stringified undefined test home", () => {
    const previous = process.env.PAPERCODE_TEST_HOME
    process.env.PAPERCODE_TEST_HOME = "undefined"
    try {
      expect(Global.Path.home).toBe(os.homedir())
    } finally {
      if (previous === undefined) delete process.env.PAPERCODE_TEST_HOME
      else process.env.PAPERCODE_TEST_HOME = previous
    }
  })
})
