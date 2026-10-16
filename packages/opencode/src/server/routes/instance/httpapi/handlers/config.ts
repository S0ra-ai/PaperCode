import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import * as InstanceState from "@/effect/instance-state"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { markInstanceForDisposal } from "../lifecycle"

export const configHandlers = HttpApiBuilder.group(InstanceHttpApi, "config", (handlers) =>
  Effect.gen(function* () {
    const providerSvc = yield* Provider.Service
    const configSvc = yield* Config.Service

    const get = Effect.fn("ConfigHttpApi.get")(function* () {
      return Config.maskSecrets(yield* configSvc.get())
    })

    const update = Effect.fn("ConfigHttpApi.update")(function* (ctx) {
      // A masked value means the client echoed back what it read; keep the stored secret.
      const restored = Config.restoreMaskedSecrets(ctx.payload, yield* configSvc.get())
      yield* configSvc.update(restored)
      yield* markInstanceForDisposal(yield* InstanceState.context)
      return restored
    })

    const providers = Effect.fn("ConfigHttpApi.providers")(function* () {
      const providers = yield* providerSvc.list()
      return {
        providers: Object.values(providers).map((item) => Provider.redact(item)),
        default: Provider.defaultModelIDs(providers),
      }
    })

    return handlers.handle("get", get).handle("update", update).handle("providers", providers)
  }),
)
