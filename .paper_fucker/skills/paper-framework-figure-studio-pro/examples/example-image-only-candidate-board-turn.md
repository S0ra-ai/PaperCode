# Example P5 IMAGE_ONLY Diverse First-Round Candidate Board Turn

This file documents the expected P5 behavior. The actual P5 reply must contain only generated image artifacts.

Expected constraints:

- mode: `IMAGE_ONLY`
- no prose
- no state footer
- no caption
- no critique
- candidate count: 4-6, normally 6
- first-round purpose: maximize direction-level diversity
- varied axes: subtype / layout grammar / metaphor / density / panel rhythm / style family
- rendering route: ChatGPT web Create image / ChatGPT Images 2.0, or Codex `$imagegen` first with approved API fallback

The next `TEXT_ONLY` reply after this turn must record `candidate_image_batch_id`, review the candidates, select the current best first-round direction, and trigger P6b. It must not go directly to P7.
