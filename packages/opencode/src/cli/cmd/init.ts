import { Effect } from "effect"
import { diagnoseInit, resetInitState, runInitWizard, type InitResetScope } from "@/paper/init"
import { effectCmd } from "../effect-cmd"

function readPairs(values: string[] | undefined) {
  const result: Record<string, string> = {}
  for (const value of values ?? []) {
    const index = value.indexOf("=")
    if (index <= 0) throw new Error(`Expected name=value, got: ${value}`)
    result[value.slice(0, index)] = value.slice(index + 1)
  }
  return result
}

export const InitCommand = effectCmd({
  command: "init [action]",
  describe: "initialize, inspect, or reset local Paper Fucker state",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("action", {
        describe: "init action",
        type: "string",
        choices: ["doctor", "diagnostics", "reset"] as const,
      })
      .option("yes", {
        describe: "confirm non-interactive init or reset",
        type: "boolean",
      })
      .option("home", {
        describe: "override user home for Paper Fucker global state",
        type: "string",
      })
      .option("workspace", {
        describe: "workspace whose ignored .paper_fucker/local and runs state may be reset",
        type: "string",
      })
      .option("tool", {
        describe: "link a local external tool as name=path",
        type: "string",
        array: true,
      })
      .option("secret", {
        describe: "write an encrypted local secret as name=value",
        type: "string",
        array: true,
      })
      .option("secrets-passphrase", {
        describe: "passphrase for local encrypted secrets",
        type: "string",
      })
      .option("full-access-ack", {
        describe: "acknowledge Full Access risk for local automation",
        type: "boolean",
      })
      .option("bounded", {
        describe: "use bounded access instead of Full Access",
        type: "boolean",
      })
      .option("bounded-hours", {
        describe: "hours for bounded access",
        type: "number",
      })
      .option("no-preview-auto-open", {
        describe: "disable automatic live preview browser opening",
        type: "boolean",
      })
      .option("total-budget", {
        describe: "total soft USD budget",
        type: "number",
      })
      .option("scope", {
        describe: "reset scope",
        type: "string",
        choices: ["all", "global", "workspace-local", "workspace-runs"] as const,
        default: "all",
      })
      .option("backup", {
        describe: "backup reset targets before deletion",
        type: "boolean",
        default: true,
      }),
  handler: Effect.fn("Cli.init")(function* (args) {
    return yield* Effect.promise(async () => {
      const action = args.action
      if (action === "doctor" || action === "diagnostics") {
        console.log(JSON.stringify(await diagnoseInit(args.home), null, 2))
        return
      }
      if (action === "reset") {
        console.log(
          JSON.stringify(
            await resetInitState({
              scope: args.scope as InitResetScope,
              home: args.home,
              workspace: args.workspace,
              backup: args.backup,
              yes: Boolean(args.yes),
            }),
            null,
            2,
          ),
        )
        return
      }
      if (!args.yes) throw new Error("Non-interactive init currently requires --yes.")
      console.log(
        JSON.stringify(
          await runInitWizard({
            home: args.home,
            workspace: args.workspace,
            tool_links: readPairs(args.tool),
            secrets: readPairs(args.secret),
            secrets_passphrase: args.secretsPassphrase,
            access: {
              mode: args.bounded ? "bounded" : "full_access",
              bounded_hours: args.boundedHours,
              full_access_acknowledged: Boolean(args.fullAccessAck),
            },
            preview: {
              auto_open: !args.noPreviewAutoOpen,
            },
            budgets: {
              total_soft_usd: args.totalBudget,
            },
          }),
          null,
          2,
        ),
      )
    })
  }),
})
