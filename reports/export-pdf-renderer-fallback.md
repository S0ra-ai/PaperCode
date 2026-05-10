# Export PDF Renderer Fallback

- Task: `task-049-export-pdf-renderer-fallback`
- Version target: `0.4.3-dev`
- Date: 2026-05-10
- Branch: `fix/pdf-renderer-fallback`

## Result

PDF export now tries LaTeX engines in this order:

1. `latexmk`
2. `xelatex`
3. `pdflatex`
4. `lualatex`
5. `tectonic`

If one engine fails, the renderer records the per-engine diagnostic and continues. The PDF file is marked `written` when any later engine succeeds.

The renderer also normalizes paths passed to LaTeX engines from Windows `\` separators to `/`, because TeX can parse unnormalized backslashes as control sequences.

Pandoc Markdown-to-LaTeX conversion now uses standalone output (`pandoc -s -t latex`) so the produced `.tex` file can be compiled directly by PDF engines.

## Live Evidence

- Direct smoke: pandoc standalone LaTeX plus `xelatex` generated `tmp/pdf-fallback-smoke/smoke.pdf`.
- PaperRun smoke: `npx --yes bun@1.3.13 scripts/live-paper-quality-benchmark.ts`.
- Live run id: `run-045f3eb0-cb86-4340-89b9-d0ee58464040`.
- Forced export formats: Markdown, LaTeX, PDF, DOCX.
- Forced PDF status: `written`.
- Retained diagnostic: `latexmk` failed with `runscript.tlu`, then fallback PDF rendering succeeded.
- Summary JSON: `tmp/live-paper-quality-benchmark/paperrun-summary.json` (ignored runtime output).

## Verification

- `npx --yes bun@1.3.13 --cwd packages/opencode test test/paper/export-pipeline.test.ts`
- `npx --yes bun@1.3.13 scripts/live-paper-quality-benchmark.ts`

