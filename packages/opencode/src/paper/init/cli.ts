import { diagnoseInit, runInitWizard } from "./wizard"
import { resetInitState, type InitResetScope } from "./reset"

function usage() {
  return `paper_fucker init|doctor|diagnostics|reset [options]

Commands:
  init --yes --full-access-ack [--home PATH] [--workspace PATH] [--tool name=path] [--secret name=value]
  doctor|diagnostics [--home PATH]
  reset --scope all|global|workspace-local|workspace-runs --backup --yes [--home PATH] [--workspace PATH]
`
}

function readPairs(values: string[]) {
  const result: Record<string, string> = {}
  for (const value of values) {
    const index = value.indexOf("=")
    if (index <= 0) throw new Error(`Expected name=value, got: ${value}`)
    result[value.slice(0, index)] = value.slice(index + 1)
  }
  return result
}

function collect(args: string[], flag: string) {
  const values: string[] = []
  for (let index = 0; index < args.length; index++) {
    if (args[index] === flag) values.push(args[index + 1] ?? "")
  }
  return values.filter(Boolean)
}

function value(args: string[], flag: string) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0]
  if (!command || command === "--help" || command === "-h") {
    console.log(usage())
    return 0
  }
  if (command === "init") {
    if (!argv.includes("--yes")) throw new Error("Non-interactive init currently requires --yes.")
    const result = await runInitWizard({
      home: value(argv, "--home"),
      workspace: value(argv, "--workspace"),
      tool_links: readPairs(collect(argv, "--tool")),
      secrets: readPairs(collect(argv, "--secret")),
      secrets_passphrase: value(argv, "--secrets-passphrase"),
      access: {
        mode: argv.includes("--bounded") ? "bounded" : "full_access",
        bounded_hours: value(argv, "--bounded-hours") ? Number(value(argv, "--bounded-hours")) : undefined,
        full_access_acknowledged: argv.includes("--full-access-ack"),
      },
      preview: {
        auto_open: !argv.includes("--no-preview-auto-open"),
      },
      budgets: {
        total_soft_usd: value(argv, "--total-budget") ? Number(value(argv, "--total-budget")) : undefined,
      },
    })
    console.log(JSON.stringify(result, null, 2))
    return 0
  }
  if (command === "doctor" || command === "diagnostics") {
    console.log(JSON.stringify(await diagnoseInit(value(argv, "--home")), null, 2))
    return 0
  }
  if (command === "reset") {
    const result = await resetInitState({
      scope: (value(argv, "--scope") ?? "all") as InitResetScope,
      home: value(argv, "--home"),
      workspace: value(argv, "--workspace"),
      backup: !argv.includes("--no-backup"),
      yes: argv.includes("--yes"),
    })
    console.log(JSON.stringify(result, null, 2))
    return 0
  }
  throw new Error(`Unknown command: ${command}`)
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    },
  )
}
