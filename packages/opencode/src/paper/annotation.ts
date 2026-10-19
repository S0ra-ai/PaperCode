/**
 * Export and import a human annotation sheet for a ranking dataset. The generator can grade
 * candidates with model judges, but a venue submission needs human labels; this module turns the
 * dataset into a CSV for annotators and folds their labels back in.
 */

export type AnnotationCandidate = {
  id: string
  title: string
  abstract: string
  label?: number
  label_b?: number
  /** The model label, preserved after a human label replaces `label`. */
  label_model?: number
  human_label?: number
}

export type AnnotationQuery = {
  query: string
  candidates: AnnotationCandidate[]
}

export type AnnotationDataset = {
  schema_version?: string
  label_policy?: string
  label_provenance?: Record<string, unknown>
  queries?: AnnotationQuery[]
  candidates?: AnnotationCandidate[]
  [key: string]: unknown
}

export type AnnotationRow = {
  query: string
  candidate_id: string
  title: string
  abstract: string
  judge_a: string
  judge_b: string
  human_label: string
  notes: string
}

const HEADER = ["query", "candidate_id", "title", "abstract", "judge_a", "judge_b", "human_label", "notes"]
const ABSTRACT_LIMIT = 2000

function groups(dataset: AnnotationDataset): AnnotationQuery[] {
  if (Array.isArray(dataset.queries) && dataset.queries.length > 0) return dataset.queries
  if (Array.isArray(dataset.candidates)) return [{ query: "", candidates: dataset.candidates }]
  return []
}

export function annotationRows(dataset: AnnotationDataset): AnnotationRow[] {
  return groups(dataset).flatMap((group) =>
    group.candidates.map((candidate) => ({
      query: group.query,
      candidate_id: candidate.id,
      title: candidate.title,
      abstract: candidate.abstract.slice(0, ABSTRACT_LIMIT),
      judge_a: candidate.label === undefined ? "" : String(candidate.label),
      judge_b: candidate.label_b === undefined ? "" : String(candidate.label_b),
      human_label: candidate.human_label === undefined ? "" : String(candidate.human_label),
      notes: "",
    })),
  )
}

function escapeField(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function toCsv(rows: AnnotationRow[]): string {
  const lines = [HEADER.join(",")]
  for (const row of rows) {
    lines.push(
      [row.query, row.candidate_id, row.title, row.abstract, row.judge_a, row.judge_b, row.human_label, row.notes]
        .map(escapeField)
        .join(","),
    )
  }
  return `${lines.join("\n")}\n`
}

/** RFC 4180 parser: quoted fields may contain commas, quotes and newlines. */
export function fromCsv(text: string): AnnotationRow[] {
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let quoted = false
  let index = 0
  while (index < text.length) {
    const character = text[index]!
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += character
      index += 1
      continue
    }
    if (character === '"') {
      quoted = true
      index += 1
      continue
    }
    if (character === ",") {
      row.push(field)
      field = ""
      index += 1
      continue
    }
    if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1
      row.push(field)
      rows.push(row)
      field = ""
      row = []
      index += 1
      continue
    }
    field += character
    index += 1
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...data] = rows
  if (!header) return []
  const indexOf = (name: string) => header.findIndex((column) => column.trim().toLowerCase() === name)
  const positions = {
    query: indexOf("query"),
    candidate_id: indexOf("candidate_id"),
    title: indexOf("title"),
    abstract: indexOf("abstract"),
    judge_a: indexOf("judge_a"),
    judge_b: indexOf("judge_b"),
    human_label: indexOf("human_label"),
    notes: indexOf("notes"),
  }
  if (positions.candidate_id < 0) throw new Error("Annotation sheet is missing the candidate_id column.")
  const value = (cells: string[], position: number) => (position >= 0 ? (cells[position] ?? "") : "")
  return data
    .filter((cells) => cells.some((cell) => cell.trim().length > 0))
    .map((cells) => ({
      query: value(cells, positions.query),
      candidate_id: value(cells, positions.candidate_id),
      title: value(cells, positions.title),
      abstract: value(cells, positions.abstract),
      judge_a: value(cells, positions.judge_a),
      judge_b: value(cells, positions.judge_b),
      human_label: value(cells, positions.human_label),
      notes: value(cells, positions.notes),
    }))
}

function parseLabel(value: string, maximum: number) {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return undefined
  const label = Number(trimmed)
  return label <= maximum ? label : undefined
}

/** Quadratic weighted kappa; returns undefined when the ratings have no variance to compare. */
export function quadraticWeightedKappa(left: number[], right: number[], maximum = 3): number | undefined {
  if (left.length !== right.length || left.length === 0) return undefined
  const size = maximum + 1
  const observed = Array.from({ length: size }, () => Array.from({ length: size }, () => 0))
  for (let index = 0; index < left.length; index++) observed[left[index]!]![right[index]!] += 1
  const rowTotals = observed.map((row) => row.reduce((sum, value) => sum + value, 0))
  const columnTotals = Array.from({ length: size }, (_, column) =>
    observed.reduce((sum, row) => sum + row[column]!, 0),
  )
  const total = left.length
  let numerator = 0
  let denominator = 0
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const weight = (row - column) ** 2
      numerator += weight * observed[row]![column]!
      denominator += (weight * rowTotals[row]! * columnTotals[column]!) / total
    }
  }
  if (denominator === 0) return undefined
  return Number((1 - numerator / denominator).toFixed(4))
}

export type HumanLabelReport = {
  annotated: number
  total: number
  coverage: number
  kappa?: number
}

/**
 * Fold annotated rows back into the dataset. A valid human label replaces the model label so the
 * evaluation uses it; unannotated candidates keep their existing label.
 */
export function applyHumanLabels(
  dataset: AnnotationDataset,
  rows: AnnotationRow[],
  options?: { importedAt?: string },
): { dataset: AnnotationDataset; report: HumanLabelReport } {
  const byKey = new Map<string, AnnotationRow>()
  for (const row of rows) {
    if (row.candidate_id.trim().length === 0) continue
    byKey.set(`${row.query}\u0000${row.candidate_id}`, row)
  }
  const human: number[] = []
  const model: number[] = []
  let annotated = 0
  let total = 0
  const groupsToUpdate = groups(dataset)
  for (const group of groupsToUpdate) {
    for (const candidate of group.candidates) {
      total += 1
      const row = byKey.get(`${group.query}\u0000${candidate.id}`)
      const label = row ? parseLabel(row.human_label, 3) : undefined
      if (label !== undefined) {
        // Preserve the model label before the human label replaces it, so re-imports still
        // compare human and model judgments instead of comparing a label with itself.
        if (candidate.label_model === undefined && candidate.label !== undefined)
          candidate.label_model = candidate.label
        candidate.human_label = label
        candidate.label = label
      }
      if (candidate.human_label !== undefined) {
        annotated += 1
        if (candidate.label_model !== undefined) {
          human.push(candidate.human_label)
          model.push(candidate.label_model)
        }
      }
    }
  }
  const report: HumanLabelReport = {
    annotated,
    total,
    coverage: total === 0 ? 0 : Number((annotated / total).toFixed(4)),
    ...(human.length > 0 ? { kappa: quadraticWeightedKappa(human, model) } : {}),
  }
  if (annotated > 0) {
    dataset.label_provenance = {
      ...(dataset.label_provenance ?? {}),
      human_annotation: {
        annotated,
        total,
        coverage: report.coverage,
        ...(report.kappa === undefined ? {} : { kappa: report.kappa }),
        imported_at: options?.importedAt ?? new Date().toISOString(),
      },
    }
  }
  if (total > 0 && annotated === total) {
    dataset.label_policy = `Human relevance annotations (0-3) for all ${total} candidates; model judgments retained as \`label_b\` for comparison.`
  }
  return { dataset, report }
}
