import { Effect } from "effect"
import { diagnoseInit, resetInitState, runInitWizard, type InitResetScope } from "@/paper/init"
import { formatDoctorResult, formatInitResult, formatResetResult } from "@/paper/init/format"
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
  describe: "initialize, inspect, or reset local PaperCode state",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("action", {
        describe: "init action",
        type: "string",
        choices: ["doctor", "diagnostics", "reset"] as const,
      })
      .option("yes", {
        describe: "accept safe init defaults or confirm reset",
        type: "boolean",
      })
      .option("json", {
        describe: "print full machine-readable JSON output",
        type: "boolean",
      })
      .option("home", {
        describe: "override user home for PaperCode global state",
        type: "string",
      })
      .option("workspace", {
        describe: "workspace whose ignored .papercode/local and runs state may be reset",
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
        describe: "enable Full Access mode and acknowledge local automation risk",
        type: "boolean",
      })
      .option("bounded", {
        describe: "use bounded access mode (default)",
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
        const result = await diagnoseInit(args.home)
        console.log(args.json ? JSON.stringify(result, null, 2) : formatDoctorResult(result))
        return
      }
      if (action === "reset") {
        const result = await resetInitState({
          scope: args.scope as InitResetScope,
          home: args.home,
          workspace: args.workspace,
          backup: args.backup,
          yes: Boolean(args.yes),
        })
        console.log(args.json ? JSON.stringify(result, null, 2) : formatResetResult(result))
        return
      }
      const fullAccess = Boolean(args.fullAccessAck) && !args.bounded
      const result = await runInitWizard({
        home: args.home,
        workspace: args.workspace,
        tool_links: readPairs(args.tool),
        secrets: readPairs(args.secret),
        secrets_passphrase: args.secretsPassphrase,
        access: {
          mode: fullAccess ? "full_access" : "bounded",
          bounded_hours: args.boundedHours,
          full_access_acknowledged: fullAccess,
        },
        preview: {
          auto_open: !args.noPreviewAutoOpen,
        },
        budgets: {
          total_soft_usd: args.totalBudget,
        },
      })
      console.log(args.json ? JSON.stringify(result, null, 2) : formatInitResult(result))
    })
  }),
})
