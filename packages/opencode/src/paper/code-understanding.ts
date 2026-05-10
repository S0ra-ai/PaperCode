export interface CodeSourceRange {
  path: string
  start_line: number
  end_line: number
}

export interface CodeSymbolNode {
  symbol_id: string
  name: string
  kind: "function" | "class" | "interface" | "type" | "module" | "test" | "unknown"
  file_path: string
  source_range?: CodeSourceRange
  exports: boolean
}

export interface CodeFileNode {
  file_id: string
  path: string
  language: string
  package_name?: string
  source_ranges: CodeSourceRange[]
  symbol_ids: string[]
  is_test: boolean
  is_benchmark: boolean
}

export interface CodePackageNode {
  package_id: string
  name: string
  root_path: string
  file_ids: string[]
}

export interface CodeUnderstandingGraph {
  schema_version: "CodeUnderstandingGraph.v1"
  run_id: string
  workspace: string
  packages: CodePackageNode[]
  files: CodeFileNode[]
  symbols: CodeSymbolNode[]
  experiment_surfaces: Array<{
    surface_id: string
    kind: "test" | "benchmark" | "script" | "notebook"
    path: string
    source_range?: CodeSourceRange
  }>
  coverage: {
    files_indexed: number
    symbols_indexed: number
    test_files: number
    benchmark_files: number
    source_range_files: number
  }
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/")
}

function languageFromPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase()
  if (ext === "ts" || ext === "tsx") return "typescript"
  if (ext === "js" || ext === "jsx") return "javascript"
  if (ext === "py") return "python"
  if (ext === "ipynb") return "notebook"
  if (ext === "md") return "markdown"
  return ext ?? "unknown"
}

function fileID(path: string) {
  return `file:${normalizePath(path)}`
}

function sourceRange(path: string, startLine?: number, endLine?: number): CodeSourceRange | undefined {
  if (!startLine || !endLine) return undefined
  return {
    path: normalizePath(path),
    start_line: startLine,
    end_line: Math.max(startLine, endLine),
  }
}

function recalculateCoverage(graph: CodeUnderstandingGraph) {
  graph.coverage = {
    files_indexed: graph.files.length,
    symbols_indexed: graph.symbols.length,
    test_files: graph.files.filter((file) => file.is_test).length,
    benchmark_files: graph.files.filter((file) => file.is_benchmark).length,
    source_range_files: graph.files.filter((file) => file.source_ranges.length > 0).length,
  }
  return graph.coverage
}

export function createCodeUnderstandingGraph(input: {
  run_id: string
  workspace: string
  packages?: Array<{ name: string; root_path: string }>
}): CodeUnderstandingGraph {
  return {
    schema_version: "CodeUnderstandingGraph.v1",
    run_id: input.run_id,
    workspace: normalizePath(input.workspace),
    packages: (input.packages ?? []).map((item) => ({
      package_id: `package:${item.name}`,
      name: item.name,
      root_path: normalizePath(item.root_path),
      file_ids: [],
    })),
    files: [],
    symbols: [],
    experiment_surfaces: [],
    coverage: {
      files_indexed: 0,
      symbols_indexed: 0,
      test_files: 0,
      benchmark_files: 0,
      source_range_files: 0,
    },
  }
}

export function addCodeFile(
  graph: CodeUnderstandingGraph,
  input: {
    path: string
    package_name?: string
    language?: string
    source_ranges?: CodeSourceRange[]
  },
) {
  const path = normalizePath(input.path)
  const existing = graph.files.find((file) => file.path === path)
  if (existing) return existing
  const isTest = /(^|\/)(test|tests|__tests__)\/|(\.test|\.spec)\./i.test(path)
  const isBenchmark = /benchmark|bench|eval/i.test(path)
  const file: CodeFileNode = {
    file_id: fileID(path),
    path,
    language: input.language ?? languageFromPath(path),
    package_name: input.package_name,
    source_ranges: input.source_ranges ?? [],
    symbol_ids: [],
    is_test: isTest,
    is_benchmark: isBenchmark,
  }
  graph.files.push(file)
  if (input.package_name) {
    let pkg = graph.packages.find((item) => item.name === input.package_name)
    if (!pkg) {
      pkg = {
        package_id: `package:${input.package_name}`,
        name: input.package_name,
        root_path: path.split("/").slice(0, -1).join("/"),
        file_ids: [],
      }
      graph.packages.push(pkg)
    }
    pkg.file_ids.push(file.file_id)
  }
  if (isTest || isBenchmark || file.language === "notebook") {
    graph.experiment_surfaces.push({
      surface_id: `surface:${path}`,
      kind: file.language === "notebook" ? "notebook" : isBenchmark ? "benchmark" : "test",
      path,
      source_range: file.source_ranges[0],
    })
  }
  recalculateCoverage(graph)
  return file
}

export function addCodeSymbol(
  graph: CodeUnderstandingGraph,
  input: {
    file_path: string
    name: string
    kind?: CodeSymbolNode["kind"]
    start_line?: number
    end_line?: number
    exports?: boolean
  },
) {
  const file = addCodeFile(graph, { path: input.file_path })
  const range = sourceRange(file.path, input.start_line, input.end_line)
  if (range) file.source_ranges.push(range)
  const symbol: CodeSymbolNode = {
    symbol_id: `symbol:${file.path}:${input.name}`,
    name: input.name,
    kind: input.kind ?? "unknown",
    file_path: file.path,
    source_range: range,
    exports: input.exports ?? false,
  }
  graph.symbols.push(symbol)
  file.symbol_ids.push(symbol.symbol_id)
  recalculateCoverage(graph)
  return symbol
}

export function codeUnderstandingSummary(graph: CodeUnderstandingGraph) {
  return {
    packages: graph.packages.length,
    files: graph.coverage.files_indexed,
    symbols: graph.coverage.symbols_indexed,
    experiment_surfaces: graph.experiment_surfaces.length,
    source_range_files: graph.coverage.source_range_files,
  }
}
