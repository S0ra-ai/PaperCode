# PaperCode Agent Team Reference Synthesis

## Sources Checked

- Claude Code subagents documentation: specialized agents have their own context, prompt, model, tool access, permissions, optional background execution, skill preloading, and persistent memory.
- Claude Code skills documentation: skills are structured `SKILL.md` directories with optional supporting files, automatic discovery, and optional model invocation controls.
- Hugging Face smolagents documentation: supports code agents, tool-calling agents, MCP tools, multiple model backends, and sandboxed execution.
- Hugging Face ML-Intern package and Space documentation: exposes a submission loop with a ContextManager, ToolRouter, approval checks, event queue, doom-loop detection, Hugging Face docs/papers/datasets/jobs tools, sandbox/local tools, and traceable events.
- Scrapling documentation: supports single-request extraction through full crawling, async spider callbacks, concurrency, per-domain throttling, pause/resume, robots.txt compliance, blocked-request retry, development cache, JSON/JSONL export, and MCP-facing integration points.

## Borrowed Mechanisms

PaperCode should borrow mechanisms, not product shape:

- Agent Team: a PaperRun owns a team with a lead and specialist teammates. Teammates map onto recursive AgentTree nodes but share a run-level task board and mailbox.
- Multi-model assignment: every teammate can use a different provider/model through OpenCode model roles and subagent overrides.
- Isolated context: high-volume research, crawling, code mapping, and experiment logs stay in specialist contexts. The team only merges concise evidence-backed outputs.
- Skill preloading: paper profile, crawler, citation, statistics, code understanding, and export skills are built-in papercode capability packs and can be preloaded into relevant teammates.
- Memory bank: teammate memories are scoped to user/project/local policy. Project-local paper memory is private by default and must not be sent to external tools without data-egress approval.
- Harness loop: all capability calls flow through a scheduler that records tool traces, approval requirements, low-value repeated expansion, retries, and blocked diagnostics.
- Approval gate: sensitive calls such as network crawl, external model full-text egress, Hugging Face Jobs, container/GPU execution, destructive file operations, and license-conflicting source use must pause or downgrade.
- Doom-loop prevention: repeated identical searches, failed crawls, or child-agent expansion without new evidence should trigger `agent.expansion_skipped` and a harness diagnostic.
- Trace replay: PaperRun events, tool traces, and ledgers must be sufficient to replay why an artifact exists and which agent produced it.

## PaperCode Design Rules

- User-facing workflow remains Chinese TUI first. Users ask for a paper; they do not manually install paper skills, MCP servers, crawlers, or Hugging Face helpers.
- OpenCode remains substrate for provider/model/session/tool/MCP/skill/TUI runtime. PaperCode owns PaperRun state, team state, ledgers, gates, and export policy.
- Agent Team has no product hard limit on children or depth. Runtime stopping conditions are budget, time, concurrency, context, permissions, data-egress policy, license/source gates, authenticity gates, user cancellation, coverage completion, and low-value expansion.
- Child permissions can only be equal to or stricter than the parent. A teammate cannot bypass source, license, data egress, or authenticity gates.
- Bottom-up evidence merge is mandatory. Teammates may only merge claims with artifact ids, source ranges, or tool traces; unsupported summaries stay diagnostics, not ClaimLedger facts.
- Crawler and web data acquisition are first-class research capabilities. Crawled material must include URL, timestamp, robots/license status, extraction evidence, content hash, and gate decision.
- Hugging Face capabilities should mirror ML-Intern's practical loop: docs, papers, datasets, spaces, jobs, model downloads/metadata, experiment logs, and traceable evaluation outputs.

## Sources

- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code skills: https://code.claude.com/docs/en/skills
- smolagents: https://huggingface.co/docs/smolagents/index
- ML-Intern: https://pypi.org/project/ml-intern/
- ML-Intern Space: https://huggingface.co/spaces/smolagents/ml-intern/tree/main
- Scrapling: https://scrapling.readthedocs.io/en/latest/
- Scrapling repository: https://github.com/D4Vinci/Scrapling
