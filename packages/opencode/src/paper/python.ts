import { existsSync } from "fs"
import path from "path"
import { which } from "@/util/which"

/**
 * Interpreters to try, most specific first. `research-tools/pyproject.toml` requires Python >= 3.11, so
 * versioned interpreters come before a bare `python3` (3.9 on stock macOS) and `python` (absent there).
 * Shared by the Python bridge and the machine/tool discovery so both report the same interpreter.
 */
export const PYTHON_EXECUTABLES = ["python3.13", "python3.12", "python3.11", "python3", "python", "py"]

/** The interpreter provisioned for `research-tools` (`uv sync`), when the repository has one. */
function researchToolsVenv() {
  const repoRoot = path.resolve(import.meta.dirname, "../../../..")
  const candidate =
    process.platform === "win32"
      ? path.join(repoRoot, "research-tools", ".venv", "Scripts", "python.exe")
      : path.join(repoRoot, "research-tools", ".venv", "bin", "python")
  return existsSync(candidate) ? candidate : undefined
}

/** The interpreter the Python bridge would spawn, or an actionable error when none is installed. */
export function pythonExecutable(options?: { python?: string }) {
  if (options?.python) return options.python
  const override = process.env.PAPER_FUCKER_TOOL_PYTHON
  if (override) return override
  const venv = researchToolsVenv()
  if (venv) return venv
  const found = PYTHON_EXECUTABLES.find((candidate) => which(candidate))
  if (!found) {
    throw new Error(
      `No Python interpreter found (tried ${PYTHON_EXECUTABLES.join(", ")}). ` +
        "Install Python >= 3.11, run `uv sync` in research-tools, or point PAPER_FUCKER_TOOL_PYTHON at one.",
    )
  }
  return found
}

export * as PaperPython from "./python"
