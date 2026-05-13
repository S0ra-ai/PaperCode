# Paper Framework Figure Studio Pro

Paper Framework Figure Studio Pro designs, prompts, generates, critiques, and integrates publication-ready research-paper framework figures.

Version 2.5.0 was upgraded from `research-paper-figure-skill-factory` v2.0.5. It includes saved subtype/style atlas boards, required concept/reference display for abstract decisions, required visual-structure image embeds, target-paper image isolation, and a mandatory two-round visual selection workflow.

Key behavior:

- first startup reply shows saved atlas boards and no target-paper image generation;
- abstract-decision text replies must show saved reference images or non-target concept/modeling examples, or record missing status and repair action;
- visual-structure text replies must embed a saved reference or non-target visual-structure concept/modeling image when discussing layout skeleton, panel choreography, module topology, arrow grammar, candidate-board structure, second-round optimization geometry, or content architecture;
- prose-only, bullet-only, ASCII, Mermaid, SVG, or code-rendered structure explanations are not valid;
- text replies must not embed target-paper candidate images, second-round variants, draft figures, final figures, or revisions;
- first-round candidate boards maximize direction-level diversity;
- P6 selects the current best first-round direction but does not lock final direction;
- P6b/P6b-IMAGE/P6c are mandatory for paper-local best-practice optimization before P7;
- inline non-target concept/example/structure images do not satisfy P5/P6b-IMAGE/P8 and do not set image batch ids;
- ChatGPT web uses Create image through ChatGPT Images 2.0;
- Codex uses `$imagegen` first, with ChatGPT Images 2.0 API or another approved image API as fallback.

Use it for method overview diagrams, architecture diagrams, pipeline/process figures, agent workflows, system/data-flow diagrams, mechanism-intuition figures, case walkthrough panels, evidence boards, and reviewer-facing schematic figures.
