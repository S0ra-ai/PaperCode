import { afterEach, describe, expect, test } from "bun:test"
import path from "path"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Server } from "../../src/server/server"
import * as Log from "@opencode-ai/core/util/log"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"
import { waitGlobalBusEventPromise } from "./global-bus"

void Log.init({ print: false })

const original = Flag.OPENCODE_EXPERIMENTAL_HTTPAPI

function app() {
  Flag.OPENCODE_EXPERIMENTAL_HTTPAPI = true
  return Server.Default().app
}

async function waitDisposed(directory: string) {
  await waitGlobalBusEventPromise({
    message: "timed out waiting for instance disposal",
    predicate: (event) => event.payload.type === "server.instance.disposed" && event.directory === directory,
  })
}

afterEach(async () => {
  Flag.OPENCODE_EXPERIMENTAL_HTTPAPI = original
  await disposeAllInstances()
  await resetDatabase()
})

describe("config HttpApi", () => {
  test("serves config update through Hono bridge", async () => {
    await using tmp = await tmpdir({ config: { formatter: false, lsp: false } })
    const disposed = waitDisposed(tmp.path)

    const response = await app().request("/config", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-opencode-directory": tmp.path,
      },
      body: JSON.stringify({ username: "patched-user", formatter: false, lsp: false }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ username: "patched-user", formatter: false, lsp: false })
    await disposed
    expect(await Bun.file(path.join(tmp.path, "config.json")).json()).toMatchObject({
      username: "patched-user",
      formatter: false,
      lsp: false,
    })
  })

  test("masks inline provider credentials on read and restores them on write-back", async () => {
    await using tmp = await tmpdir({
      config: {
        formatter: false,
        lsp: false,
        providers: {
          fjbdg: {
            api: "openai-completions",
            baseURL: "https://keep.example.test/v1",
            options: { apiKey: "sk-live-secret" },
            models: [{ id: "m" }],
          },
        },
      },
    })
    const headers = { "content-type": "application/json", "x-opencode-directory": tmp.path }

    const read = await app().request("/config", { headers })
    const body = await read.json()
    expect(body.providers.fjbdg.options.apiKey).toBe("[redacted]")
    expect(body.providers.fjbdg.baseURL).toBe("https://keep.example.test/v1")
    expect(JSON.stringify(body)).not.toContain("sk-live-secret")

    // The client edits and writes back exactly what it read; the stored secret must survive.
    const patched = await app().request("/config", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ ...body, username: "patched", formatter: false, lsp: false }),
    })
    expect(patched.status).toBe(200)
    const after = await patched.json()
    expect(after.providers.fjbdg.options.apiKey).toBe("sk-live-secret")
  })
})
