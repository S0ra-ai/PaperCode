---
name: nature-paper
description: Build and check Nature Portfolio paper profiles for papercode research runs
---

# Nature Paper

Use this skill when a PaperCode run targets Nature, Nature Portfolio, or a nearby Nature-style profile.

## Source Policy

Fetch current official Nature Portfolio guidance before producing profile guidance or checks.

Primary official sources:

1. `https://www.nature.com/nature/for-authors`
2. `https://www.nature.com/nature-portfolio/for-authors/write`
3. The target journal's own `for-authors` page when the user names a specific Nature Portfolio journal.

Do not treat this skill as a frozen copy of Nature rules. The skill provides the procedure and output contract; current requirements must come from official pages at run time.

## Output Contract

Produce a `PaperProfile.v1` object for the target run with:

- `profile_id`: `nature-paper`
- `official_guidance_sources`: official URLs checked during this run
- `structure_recommendation`: Nature-style title, authors, affiliations, summary paragraph or abstract, introduction, results, methods, references, figure legends, acknowledgements, author contributions, data availability, code availability, ethics, competing interests, additional information, and supplementary material guidance
- `required_checks`: profile checks that the verification gate must evaluate
- `template_strategy`: official template first when available, otherwise venue-compatible Markdown/LaTeX with all deviations recorded

## Required Checks

Check at minimum:

- Abstract or summary paragraph
- Introduction and results structure
- Methods completeness
- Data availability statement
- Code availability statement
- Ethics or approval statement when relevant
- Competing interests declaration
- Figure and table readiness
- References and citation style
- Supplementary material expectations
- Target-journal deviations from generic Nature Portfolio guidance

## Runtime Behavior

- Attach source URLs and retrieval timestamps to the profile artifact.
- If official guidance cannot be reached, return a blocked profile diagnostic instead of guessing.
- If guidance conflicts with the user's target journal, prefer the target journal's official page and record the conflict.
- This profile only controls structure, formatting, and submission checks. It must not bypass papercode authenticity gates for claims, citations, data, code, or reproduction.
