import path from "path"
import { mkdir } from "fs/promises"
import { appendResearchEvent, runPythonCliTool, writeResearchArtifact, type PythonBridgeOptions } from "../runtime"
import { withSpan } from "../telemetry"
import type { TemplateSpec } from "./spec"

export type TemplateApplicationResult = {
  markdown_path: string
  latex_path: string
  template_id: string
  diagnostics: string[]
}

export async function applyTemplateToMarkdown(
  runDir: string,
  input: { markdown: string; spec: TemplateSpec; output_name?: string },
  options?: PythonBridgeOptions,
): Promise<TemplateApplicationResult> {
  return withSpan(
    "research.template.apply",
    { "papercode.research.template.id": input.spec.template_id },
    async () => {
      const outputName = input.output_name ?? "paper"
      const workDir = path.join(runDir, "template-work")
      await mkdir(workDir, { recursive: true })
      const markdownPath = path.join(workDir, `${outputName}.md`)
      const latexPath = path.join(workDir, `${outputName}.tex`)
      await Bun.write(markdownPath, input.markdown)
      const command = await runPythonCliTool(
        runDir,
        {
          name: "md-to-latex",
          args: ["md-to-latex", markdownPath, "-o", latexPath, "--allow-fallback"],
          artifact_logical_path: "templates/md-to-latex-tool.json",
        },
        options,
      )
      const diagnostics = command.command.exit_code === 0 ? [] : [command.command.stderr || "md-to-latex failed"]
      const result: TemplateApplicationResult = {
        markdown_path: markdownPath,
        latex_path: latexPath,
        template_id: input.spec.template_id,
        diagnostics,
      }
      await writeResearchArtifact(
        runDir,
        {
          kind: "log",
          logical_path: "templates/template-application.json",
          data: result,
          metadata: { artifact_schema: "TemplateApplication.v1", template_id: input.spec.template_id },
        },
        options,
      )
      await appendResearchEvent(
        runDir,
        {
          type: "template.applied",
          actor: "tool",
          payload: { template_id: input.spec.template_id, latex_path: latexPath, diagnostics },
        },
        options,
      )
      return result
    },
  )
}
