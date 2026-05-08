# External Research Agent Analysis

Sources: SakanaAI AI Scientist, PaperOrchestra, AutoResearch, EvoScientist, FARS, and related AutoRA references.
Decision: adopt bounded mechanisms, reject unbounded scale-first automation.

## AI Scientist

Source: https://github.com/SakanaAI/AI-Scientist and https://arxiv.org/abs/2408.06292

- Useful: idea generation, experiment execution, paper writing, and simulated review as separate gates.
- Useful: explicit caution around LLM-written code and container/web restrictions.
- Risk: Linux/NVIDIA/CUDA bias, long-running GPU cost, and generated code safety.
- Decision: adopt stage separation and safety posture; do not copy templates or runtime.

## PaperOrchestra

Source: https://github.com/Ar9av/PaperOrchestra and https://arxiv.org/abs/2604.05018

- Useful: multi-agent writing roles, paper-fidelity mapping, provenance snapshots, orphan-citation gates, and rollback from worklogs.
- Risk: prompt/license provenance needs care; paper-writing roles can mask unsupported claims if not bound to a ledger.
- Decision: adopt role decomposition and hardening checks; bind all output to `ClaimLedger`.

## AutoResearch

Source: https://github.com/karpathy/autoresearch

- Useful: minimal loop of edit, run bounded experiment, read metric, keep or revert.
- Risk: narrow benchmark focus; not enough for literature, template, and paper export needs.
- Decision: adopt the experiment-loop discipline for `task-012`, especially metric-driven keep/revert.

## EvoScientist

Source: https://github.com/EvoScientist/EvoScientist and https://arxiv.org/abs/2603.08127

- Useful: persistent research memory, skills/knowledge packs, and human-on-the-loop framing.
- Risk: self-evolution is dangerous before authenticity gates and traceability are mature.
- Decision: defer memory/self-evolution; adopt skill-pack separation later.

## FARS

Source: https://analemma.ai/blog/introducing-fars/ and https://gitlab.com/fars-a

- Useful: full workflow visibility, public trace, cost awareness, ideation/planning/experiment/writing split.
- Risk: scale-first execution is expensive and can flood output before verification.
- Decision: reject scale-first automation; adopt observability and cost gates.

## AutoRA

Source: https://github.com/AutoResearch/autora

- Useful: empirical research vocabulary around model discovery, experimental design, data collection, and documentation.
- Risk: less directly aligned with CS/AI paper generation from coding agents.
- Decision: related reference only.
