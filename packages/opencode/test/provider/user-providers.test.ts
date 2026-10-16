import { test, expect, describe } from "bun:test"
import path from "path"

import { tmpdir } from "../fixture/fixture"
import { WithInstance } from "../../src/project/with-instance"
import { Instance } from "../../src/project/instance"
import { Provider } from "@/provider/provider"
import { ProviderID, ModelID } from "../../src/provider/schema"
import { ProviderTransform } from "@/provider/transform"
import { ConfigProvider } from "@/config/provider"
import { Env } from "../../src/env"
import { Effect } from "effect"
import { AppRuntime } from "../../src/effect/app-runtime"
import { makeRuntime } from "../../src/effect/run-service"

const env = makeRuntime(Env.Service, Env.defaultLayer)
const set = (k: string, v: string) => env.runSync((svc) => svc.set(k, v))

async function run<A, E>(fn: (provider: Provider.Interface) => Effect.Effect<A, E, never>) {
  return AppRuntime.runPromise(
    Effect.gen(function* () {
      const provider = yield* Provider.Service
      return yield* fn(provider)
    }),
  )
}

const list = () => run((provider) => provider.list())

async function withConfig<T>(config: object, env: Record<string, string>, fn: () => Promise<T>) {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(path.join(dir, "papercode.json"), JSON.stringify(config))
    },
  })
  // The temp dir must stay alive until the instance has loaded its config, so await inside the
  // `await using` scope rather than returning the pending promise.
  const result = await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      // Env is instance-scoped, so keys must be set inside the instance context.
      for (const [key, value] of Object.entries(env)) set(key, value)
      return fn()
    },
  })
  return result
}

const dialect = {
  $schema: "https://papercode.local/config.json",
  providers: {
    fjbdg: {
      displayName: "fjbdg",
      apiKeyEnv: "FJBDG_API_KEY",
      api: "openai-completions",
      baseURL: "https://newapi.example.test:10443/v1",
      reasoning: "max",
      models: [
        {
          id: "deepseek-v4-flash-vision-exp",
          contextWindow: 1000000,
          maxTokens: 384000,
          input: ["text", "image"],
        },
      ],
    },
  },
}

describe("providers dialect", () => {
  test("registers a user-declared OpenAI-compatible endpoint with full model metadata", async () => {
    await withConfig(dialect, { FJBDG_API_KEY: "test-fjbdg-key" }, async () => {
      const providers = await list()
      const provider = providers[ProviderID.make("fjbdg")]

      expect(provider).toBeDefined()
      expect(provider.name).toBe("fjbdg")
      expect(provider.source).toBe("config")
      expect(provider.env).toEqual(["FJBDG_API_KEY"])
      expect(provider.key).toBe("test-fjbdg-key")
      expect(provider.options.baseURL).toBe("https://newapi.example.test:10443/v1")

      const model = provider.models[ModelID.make("deepseek-v4-flash-vision-exp")]
      expect(model).toBeDefined()
      expect(model.api.npm).toBe("@ai-sdk/openai-compatible")
      expect(model.api.id).toBe("deepseek-v4-flash-vision-exp")
      expect(model.limit.context).toBe(1000000)
      expect(model.limit.output).toBe(384000)
      // A declared limit is honored verbatim instead of clamped to OUTPUT_TOKEN_MAX.
      expect(model.limit.source).toBe("config")
      expect(ProviderTransform.maxOutputTokens(model)).toBe(384000)
      expect(model.capabilities.input.image).toBe(true)
      expect(model.capabilities.input.text).toBe(true)
      expect(model.capabilities.reasoning).toBe(true)
      expect(model.options.reasoningEffort).toBe("max")
      // The declared effort is selectable, not just the default for requests.
      expect(Object.keys(model.variants ?? {})).toContain("max")
    })
  })

  test("models as a record and a per-model reasoning override both work", async () => {
    await withConfig(
      {
        $schema: "https://papercode.local/config.json",
        providers: {
          local: {
            displayName: "Local",
            apiKeyEnv: "LOCAL_API_KEY",
            api: "openai-compatible",
            baseURL: "http://127.0.0.1:8080/v1",
            reasoning: "low",
            models: {
              "small-model": { contextWindow: 8000, maxTokens: 2000, input: ["text"] },
              "thinking-model": { contextWindow: 200000, maxTokens: 64000, reasoning: "high" },
            },
          },
        },
      },
      { LOCAL_API_KEY: "local-key" },
      async () => {
        const providers = await list()
        const provider = providers[ProviderID.make("local")]
        expect(provider.name).toBe("Local")

        const small = provider.models[ModelID.make("small-model")]
        expect(small.limit.context).toBe(8000)
        expect(small.limit.output).toBe(2000)
        expect(small.capabilities.input.image).toBe(false)
        expect(small.options.reasoningEffort).toBe("low")

        const thinking = provider.models[ModelID.make("thinking-model")]
        expect(thinking.limit.output).toBe(64000)
        expect(thinking.options.reasoningEffort).toBe("high")
      },
    )
  })

  test("a provider-level reasoning boolean still marks capabilities without pinning an effort", async () => {
    await withConfig(
      {
        $schema: "https://papercode.local/config.json",
        providers: {
          plain: {
            api: "openai-completions",
            baseURL: "https://plain.example.test/v1",
            reasoning: true,
            models: [{ id: "plain-model", contextWindow: 32000, maxTokens: 4000 }],
          },
        },
      },
      {},
      async () => {
        const providers = await list()
        const model = providers[ProviderID.make("plain")].models[ModelID.make("plain-model")]
        expect(model.capabilities.reasoning).toBe(true)
        expect(model.options.reasoningEffort).toBeUndefined()
      },
    )
  })

  test("the legacy provider key wins when both declare the same id", async () => {
    await withConfig(
      {
        $schema: "https://papercode.local/config.json",
        providers: {
          dual: {
            displayName: "From Dialect",
            baseURL: "https://dialect.example.test/v1",
            models: [{ id: "from-dialect", contextWindow: 1000, maxTokens: 100 }],
          },
        },
        provider: {
          dual: {
            name: "From Legacy",
            options: { baseURL: "https://legacy.example.test/v1" },
            models: { "from-legacy": { limit: { context: 2000, output: 200 } } },
          },
        },
      },
      {},
      async () => {
        const provider = (await list())[ProviderID.make("dual")]
        expect(provider.name).toBe("From Legacy")
        expect(provider.options.baseURL).toBe("https://legacy.example.test/v1")
      },
    )
  })
})

describe("providers dialect validation", () => {
  test("unknown keys are reported with their path", () => {
    const issues = ConfigProvider.validateUserProviders({
      fjbdg: { baseUrl: "https://typo.example.test/v1", models: [{ id: "m", contextWindow: 1 }] },
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      code: "unrecognized_keys",
      keys: ["baseUrl"],
      path: ["fjbdg"],
    })
  })

  test("unknown model keys are reported with their path", () => {
    const issues = ConfigProvider.validateUserProviders({
      fjbdg: { models: [{ id: "m", maxToken: 100 }] },
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      code: "unrecognized_keys",
      keys: ["maxToken"],
      path: ["fjbdg", "models", "0"],
    })
  })

  test("a models list needs ids, and they must be unique and non-empty", () => {
    expect(ConfigProvider.validateUserProviders({ p: { models: [] } })[0]).toMatchObject({
      code: "custom",
      path: ["p", "models"],
    })
    expect(ConfigProvider.validateUserProviders({ p: { models: [{ contextWindow: 1 }] } })[0]).toMatchObject({
      code: "custom",
      path: ["p", "models", "0"],
    })
    expect(ConfigProvider.validateUserProviders({ p: { models: [{ id: "m" }, { id: "m" }] } })[0]).toMatchObject({
      code: "custom",
      path: ["p", "models", "1"],
    })
  })

  test("a valid block reports nothing", () => {
    expect(ConfigProvider.validateUserProviders(dialect.providers)).toEqual([])
  })
})

describe("providers dialect normalization", () => {
  test("maps the dialect onto the internal provider records", () => {
    const normalized = ConfigProvider.normalizeUserProviders({
      fjbdg: {
        displayName: "fjbdg",
        apiKeyEnv: "FJBDG_API_KEY",
        api: "openai-completions",
        baseURL: "https://newapi.example.test:10443/v1",
        reasoning: "max",
        models: [{ id: "m", contextWindow: 1000000, maxTokens: 384000, input: ["text", "image"] }],
      },
    })
    expect(normalized.fjbdg).toMatchObject({
      name: "fjbdg",
      env: ["FJBDG_API_KEY"],
      npm: "@ai-sdk/openai-compatible",
      options: { baseURL: "https://newapi.example.test:10443/v1" },
      models: {
        m: {
          limit: { context: 1000000, output: 384000 },
          modalities: { input: ["text", "image"], output: ["text"] },
          reasoning: true,
          options: { reasoningEffort: "max" },
        },
      },
    })
  })

  test("an explicit limit wins over the contextWindow/maxTokens aliases", () => {
    const normalized = ConfigProvider.normalizeUserProviders({
      p: { models: [{ id: "m", contextWindow: 100, maxTokens: 10, limit: { context: 200, output: 20 } }] },
    })
    expect(normalized.p.models?.m.limit).toEqual({ context: 100, output: 10 })
  })
})

describe("provider api redaction", () => {
  test("the resolved key is masked while staying truthy", () => {
    const info = {
      id: ProviderID.make("fjbdg"),
      name: "fjbdg",
      source: "env" as const,
      env: ["FJBDG_API_KEY"],
      key: "sk-secret-value",
      options: {},
      models: {},
    }
    const redacted = Provider.redact(info)
    expect(redacted.key).toBe("[redacted]")
    expect(redacted.key).not.toContain("sk-secret-value")
    expect(Boolean(redacted.key)).toBe(true)
  })

  test("providers without a key are returned unchanged", () => {
    const info = {
      id: ProviderID.make("plain"),
      name: "plain",
      source: "config" as const,
      env: [],
      options: {},
      models: {},
    }
    expect(Provider.redact(info)).toEqual(info)
  })
})
