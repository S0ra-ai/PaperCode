# Prompt Template

Use this final-image template only after P6c has recorded/reviewed a second-round variant batch and the user has selected or accepted a final visual direction. P6 first-round selection is not enough.

```text
Create a publication-ready research-paper framework diagram as a raster image.

Goal:
<figure thesis>

Paper slot and audience:
<slot and audience>

Final direction source:
<P6c selected_second_round_candidate and what it preserves from first-round winner>

Diagram subtype and layout:
<subtype, canvas, panel count, reading order>

Visual-structure reference for TEXT_ONLY prompt explanation:
If this prompt text explains final content architecture, embed a saved atlas/reference or non-target visual-structure concept image in the surrounding TEXT_ONLY reply. Do not describe the structure with prose/bullets only; refer to P6c selected_second_round_candidate for paper-specific structure.

Required content:
<modules/entities/stages/evidence>

Labels:
Use only these exact labels: <labels>.

Sample-image transfer:
<per-image transfer rules or "none">

Rendering route:
ChatGPT web should use Create image through ChatGPT Images 2.0.
Codex should use $imagegen first; if unavailable, use ChatGPT Images 2.0 API or another approved image-generation API.

Response boundary:
If this prompt is shown in a TEXT_ONLY reply, stop before target-paper image generation. Generate target-paper formal candidates only in a later IMAGE_ONLY response after user confirmation. Inline non-target concept/example/visual-structure images may be embedded only as explanatory references and do not satisfy P5/P6b-IMAGE/P8.

Style and color semantics:
<style, palette, what colors mean>

Candidate variation:
Generate <4/5/6> formal candidates, usually 6. Vary only <minor polish/rendering axis>.

Avoid:
long paragraphs, microscopic labels, fake metrics, fake UI, logos, watermarks, decorative clutter, SVG/Mermaid/TikZ/Graphviz/code-rendered diagram instructions.
```
