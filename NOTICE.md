# NOTICE

This repository is private-first project work for `paper_fucker`.

Third-party software and source snapshots keep their original copyright notices
and license terms. When an OpenCode release snapshot or any other external
project is imported, record at minimum:

- project name
- source URL
- tag or commit
- import date
- license file path
- filtering decisions
- local location in this repository

The root `LICENSE` applies only to original `paper_fucker` project work unless a
file or directory explicitly carries a different third-party license.

## OpenCode

- Project: OpenCode
- Repository: https://github.com/anomalyco/opencode
- Imported release: v1.14.41
- Release URL: https://github.com/anomalyco/opencode/releases/tag/v1.14.41
- Target commit: 98e091796b6a293cf20b4187e8fc6a949e0295e4
- License: MIT
- Preserved license: `upstream/opencode-LICENSE`
- Import manifest: `upstream/opencode-manifest.json`

OpenCode source files were imported as a root overlay snapshot without upstream
git history. Active upstream GitHub workflows were not imported.

## Architecture Diagram Skill

- Project: architecture-diagram-generator
- Repository: https://github.com/Cocoon-AI/architecture-diagram-generator
- Local location: `.paper_fucker/skills/architecture-diagram`
- License: MIT

Paper Fucker bundles this as an optional built-in research diagram skill for
HTML/SVG architecture and system diagrams.

## Paper Framework Figure Studio Pro

- Project: paper-framework-figure-studio-pro
- Repository: https://github.com/c-narcissus/paper-framework-figure-studio-pro
- Local location: `.paper_fucker/skills/paper-framework-figure-studio-pro`
- License: MIT-0

Paper Fucker bundles this as an optional built-in research figure skill for
publication-ready framework, pipeline, method overview, and agent workflow
figures. The bundled package keeps its local `LICENSE` and metadata.

## bb-browser

- Project: bb-browser
- Repository: https://github.com/epiral/bb-browser
- Local status: managed capability, not vendored as first-party product source

Paper Fucker treats bb-browser as an optional managed browser and web-data
acquisition capability. It is diagnosed by `paper_fucker init doctor` and should
be installed through Paper Fucker-managed setup rather than requiring manual
user installation.
