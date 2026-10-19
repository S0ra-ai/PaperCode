#!/usr/bin/env bun

import { readFile, writeFile } from "fs/promises"
import { parseArgs } from "util"
import { annotationRows, applyHumanLabels, fromCsv, toCsv } from "../packages/opencode/src/paper/annotation"

const usage = `Usage:
  bun script/paper-annotations.ts export <dataset.json> <sheet.csv>
  bun script/paper-annotations.ts import <dataset.json> <sheet.csv> [--out <dataset.json>]

The exported sheet keeps the query, candidate id, title, abstract and the model judgments, and
leaves human_label empty. Fill it with integers 0-3, then import it: a complete sheet switches the
dataset's label policy to human annotations and replaces the model labels used by the evaluation.`

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    out: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
})

const [command, datasetPath, sheetPath] = positionals
if (values.help || !command || !datasetPath || !sheetPath) {
  console.log(usage)
  process.exit(values.help ? 0 : 1)
}

const dataset = JSON.parse(await readFile(datasetPath, "utf8"))

if (command === "export") {
  const rows = annotationRows(dataset)
  await writeFile(sheetPath, toCsv(rows))
  console.log(`Exported ${rows.length} candidates to ${sheetPath}.`)
} else if (command === "import") {
  const rows = fromCsv(await readFile(sheetPath, "utf8"))
  const { dataset: updated, report } = applyHumanLabels(dataset, rows)
  await writeFile(values.out ?? datasetPath, `${JSON.stringify(updated, null, 2)}\n`)
  console.log(
    `Human labels: ${report.annotated}/${report.total} (coverage ${report.coverage}${
      report.kappa === undefined ? "" : `, kappa ${report.kappa}`
    }).`,
  )
} else {
  console.log(usage)
  process.exit(1)
}
