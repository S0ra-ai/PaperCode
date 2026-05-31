import path from "path"
import { Effect } from "effect"
import { listPaperRuns, resumePaperRun, type PaperRunHistoryEntry, type PaperRunSnapshot } from "@/paper/run"
import { effectCmd } from "../effect-cmd"

function statusLabel(status: PaperRunHistoryEntry["status"]) {
  switch (status) {
    case "running":
      return "运行中"
    case "succeeded":
      return "已完成"
    case "blocked":
      return "已暂停"
    case "failed":
      return "失败"
    case "cancelled":
      return "已取消"
    default:
      return "已初始化"
  }
}

function formatRuns(runs: PaperRunHistoryEntry[], cwd = process.cwd()) {
  if (runs.length === 0) {
    return [
      "PaperRun 历史",
      "",
      "暂无可恢复任务。",
      "下一步: 输入研究主题启动新 PaperRun，或用 --workspace 指向已有工作区。",
    ].join("\n")
  }
  const lines = ["PaperRun 历史", ""]
  for (const run of runs) {
    const workspace = path.isAbsolute(run.workspace) ? path.relative(cwd, run.workspace) || "." : run.workspace
    lines.push(
      `${run.run_id}  ${statusLabel(run.status)}  ${run.updated_at}`,
      `  主题: ${run.topic}`,
      `  存储: ${run.storage_scope}  工作区: ${workspace}`,
      `  恢复: papercode resume ${run.run_id}`,
    )
  }
  return lines.join("\n")
}

function formatResume(run: PaperRunSnapshot) {
  return [
    "PaperRun 已恢复",
    "",
    `run id: ${run.run_id}`,
    `状态: ${statusLabel(run.status)}`,
    `主题: ${run.topic}`,
    `工作区: ${run.workspace}`,
    `存储根目录: ${run.diagnostics.runtime_root}`,
    "",
    `继续查看: papercode resume ${run.run_id} --json`,
  ].join("\n")
}

export const RunsCommand = effectCmd({
  command: "runs <action>",
  describe: "list PaperRun history",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("action", {
        describe: "runs action",
        type: "string",
        choices: ["list"] as const,
      })
      .option("json", {
        describe: "print machine-readable JSON output",
        type: "boolean",
      })
      .option("home", {
        describe: "override PaperCode home",
        type: "string",
      })
      .option("workspace", {
        describe: "workspace run root to include",
        type: "string",
      })
      .option("query", {
        describe: "filter by run id, topic, status, or workspace",
        type: "string",
      })
      .option("status", {
        describe: "filter by PaperRun status",
        type: "string",
        choices: ["initialized", "running", "succeeded", "blocked", "failed", "cancelled"] as const,
      })
      .option("limit", {
        describe: "maximum runs to print",
        type: "number",
        default: 20,
      }),
  handler: Effect.fn("Cli.runs")(function* (args) {
    return yield* Effect.promise(async () => {
      const runs = await listPaperRuns({
        home: args.home,
        workspace: args.workspace ?? process.cwd(),
        query: args.query,
        status: args.status as PaperRunHistoryEntry["status"] | undefined,
        limit: args.limit,
      })
      console.log(args.json ? JSON.stringify({ runs }, null, 2) : formatRuns(runs))
    })
  }),
})

export const ResumeCommand = effectCmd({
  command: "resume [runID]",
  describe: "resume or list previous PaperRuns",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("runID", {
        describe: "PaperRun id to resume",
        type: "string",
      })
      .option("json", {
        describe: "print machine-readable JSON output",
        type: "boolean",
      })
      .option("home", {
        describe: "override PaperCode home",
        type: "string",
      })
      .option("workspace", {
        describe: "workspace run root to include",
        type: "string",
      }),
  handler: Effect.fn("Cli.resume")(function* (args) {
    return yield* Effect.promise(async () => {
      if (!args.runID) {
        const runs = await listPaperRuns({
          home: args.home,
          workspace: args.workspace ?? process.cwd(),
          limit: 20,
        })
        console.log(args.json ? JSON.stringify({ runs }, null, 2) : formatRuns(runs))
        return
      }
      const run = await resumePaperRun(
        { run_id: args.runID },
        {
          home: args.home,
          workspace: args.workspace ?? process.cwd(),
        },
      )
      console.log(args.json ? JSON.stringify({ run }, null, 2) : formatResume(run))
    })
  }),
})
