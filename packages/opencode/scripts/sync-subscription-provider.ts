import { AppRuntime } from "../src/effect/app-runtime"
import { Provider } from "../src/provider/provider"
import { WithInstance } from "../src/project/with-instance"
import {
  candidatesFromBuiltinProviders,
  loadPaperModelInventory,
  updatePaperModelAllowlist,
  type PaperProviderRegistration,
} from "../src/paper/model-inventory"
import { Effect } from "effect"
import path from "node:path"

function argValue(name: string): string | undefined {
  const equals = process.argv.find((item) => item.startsWith(`${name}=`))
  if (equals) return equals.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  if (index >= 0) return process.argv[index + 1]
  return undefined
}

function providerName(providerID: string, fallback?: string) {
  if (providerID === "github-copilot") return "GitHub Copilot"
  if (providerID === "openai") return "ChatGPT 订阅"
  return fallback ?? providerID
}

function providerKind(providerID: string): PaperProviderRegistration["kind"] {
  if (providerID === "github-copilot") return "copilot_subscription"
  if (providerID === "openai") return "chatgpt_subscription"
  return "manual"
}

const providerID = argValue("--provider") ?? "github-copilot"
const directory = path.resolve(argValue("--directory") ?? process.cwd())

const providers = await WithInstance.provide({
  directory,
  fn: () =>
    AppRuntime.runPromise(
      Effect.gen(function* () {
        const service = yield* Provider.Service
        return yield* service.list()
      }),
    ),
})

const provider = providers[providerID as keyof typeof providers]
if (!provider) {
  console.error(`未找到可用 provider: ${providerID}`)
  console.error(`请先完成登录：paper_fucker.exe auth login --provider ${providerID}`)
  process.exit(1)
}

const candidates = candidatesFromBuiltinProviders({
  [providerID]: {
    id: provider.id,
    name: providerName(providerID, provider.name),
    models: provider.models,
  },
})
const refs = candidates.map((candidate) => candidate.model_ref).sort()

if (refs.length === 0) {
  console.error(`provider ${providerID} 没有返回可用模型。`)
  process.exit(1)
}

const current = await loadPaperModelInventory()
const nextAllowlist = Array.from(new Set([...current.allowlist, ...refs])).sort()
const registration: PaperProviderRegistration = {
  provider_id: providerID,
  provider_name: providerName(providerID, provider.name),
  kind: providerKind(providerID),
  status: "registered",
  model_count: refs.length,
  allowed_count: refs.length,
  last_refreshed_at: new Date().toISOString(),
}

const inventory = await updatePaperModelAllowlist(nextAllowlist, {
  decision_model: current.decision_model && nextAllowlist.includes(current.decision_model) ? current.decision_model : refs[0],
  backup_decision_model:
    current.backup_decision_model && nextAllowlist.includes(current.backup_decision_model)
      ? current.backup_decision_model
      : undefined,
  role_overrides: current.role_overrides,
  provider_registrations: {
    ...current.provider_registrations,
    [providerID]: registration,
  },
  stage_model_policies: current.stage_model_policies,
  candidates,
})

console.log(`provider=${providerID}`)
console.log(`models=${refs.length}`)
console.log(`decision_model=${inventory.decision_model ?? ""}`)
console.log("enabled:")
for (const ref of refs) console.log(`- ${ref}`)
