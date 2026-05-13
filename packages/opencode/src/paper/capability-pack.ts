import type { PaperCapabilityStage, ResearchCapability, ResearchCapabilityType } from "./capabilities"

export type PaperCapabilityPackId =
  | "paper-profile-skills"
  | "paper-figure-skills"
  | "literature-mcp"
  | "crawler-data"
  | "huggingface-research"
  | "code-experiment-core"
  | "writing-verification-export"

export interface PaperCapabilityPack {
  schema_version: "PaperCapabilityPack.v1"
  id: PaperCapabilityPackId
  title: string
  description: string
  default_enabled: boolean
  install_policy: "built_in" | "auto_link" | "user_configured_secret"
  capability_names: string[]
  stages: PaperCapabilityStage[]
  provides: ResearchCapabilityType[]
  capabilities: ResearchCapability[]
}

const objectSchema = { type: "object" } as const

function capability(input: Omit<ResearchCapability, "input_schema" | "output_schema">): ResearchCapability {
  return {
    ...input,
    input_schema: objectSchema,
    output_schema: objectSchema,
  }
}

function pack(input: Omit<PaperCapabilityPack, "schema_version" | "capability_names" | "stages" | "provides">): PaperCapabilityPack {
  return {
    schema_version: "PaperCapabilityPack.v1",
    ...input,
    capability_names: input.capabilities.map((item) => item.name),
    stages: Array.from(new Set(input.capabilities.flatMap((item) => item.allowed_stages))),
    provides: Array.from(new Set(input.capabilities.map((item) => item.type))),
  }
}

export function builtinPaperCapabilityPacks(): PaperCapabilityPack[] {
  return [
    pack({
      id: "paper-profile-skills",
      title: "Paper profile skills",
      description: "Built-in journal/conference profile skills for structure, statements, template checks, and export policy.",
      default_enabled: true,
      install_policy: "built_in",
      capabilities: [
        capability({
          name: "skill.nature-paper",
          type: "skill",
          substrate: "codex_skill",
          title: "Nature paper profile skill",
          description: "Nature-style structure, statements, figures, supplementary material, and submission checks.",
          trust: "profile_guidance",
          cost: "free",
          network: "required",
          allowed_stages: ["profile_formatting", "verification", "export"],
        }),
        capability({
          name: "skill.ieee-paper",
          type: "skill",
          substrate: "codex_skill",
          title: "IEEE paper profile skill",
          description: "IEEE-style manuscript and reference profile guidance.",
          trust: "profile_guidance",
          cost: "free",
          network: "optional",
          allowed_stages: ["profile_formatting", "verification", "export"],
        }),
        capability({
          name: "skill.acm-paper",
          type: "skill",
          substrate: "codex_skill",
          title: "ACM paper profile skill",
          description: "ACM-style manuscript and artifact-review profile guidance.",
          trust: "profile_guidance",
          cost: "free",
          network: "optional",
          allowed_stages: ["profile_formatting", "verification", "export"],
        }),
      ],
    }),
    pack({
      id: "paper-figure-skills",
      title: "Paper figure and diagram skills",
      description: "Paper Fucker managed skills for publication-ready framework figures and inspectable system diagrams.",
      default_enabled: true,
      install_policy: "built_in",
      capabilities: [
        capability({
          name: "skill.architecture-diagram",
          type: "skill",
          substrate: "codex_skill",
          title: "Architecture diagram skill",
          description: "Create self-contained HTML/SVG architecture and system diagrams for methods, platforms, and pipelines.",
          trust: "local_generated",
          cost: "free",
          network: "optional",
          allowed_stages: ["planning", "drafting", "revision", "export"],
        }),
        capability({
          name: "skill.paper-framework-figure-studio-pro",
          type: "skill",
          substrate: "codex_skill",
          title: "Paper framework figure studio",
          description:
            "Design, critique, generate, and integrate reviewer-facing research framework figures, method overviews, pipelines, and agent workflows.",
          trust: "local_generated",
          cost: "free",
          network: "optional",
          allowed_stages: ["planning", "drafting", "profile_formatting", "revision", "export"],
        }),
      ],
    }),
    pack({
      id: "literature-mcp",
      title: "Literature MCP bus",
      description: "Automatically linked literature and source-verification MCP surfaces.",
      default_enabled: true,
      install_policy: "auto_link",
      capabilities: [
        capability({
          name: "exa",
          type: "mcp",
          substrate: "external_mcp",
          title: "Exa remote research search",
          description: "Remote Exa MCP search for literature, data, and source verification.",
          trust: "external_verified",
          cost: "metered",
          network: "required",
          allowed_stages: ["literature", "data", "verification"],
        }),
        capability({
          name: "mcp.crossref",
          type: "mcp",
          substrate: "external_mcp",
          title: "Crossref metadata search",
          description: "DOI, reference, and publication metadata discovery.",
          trust: "external_verified",
          cost: "free",
          network: "required",
          allowed_stages: ["literature", "verification"],
        }),
        capability({
          name: "mcp.semantic-scholar",
          type: "mcp",
          substrate: "external_mcp",
          title: "Semantic Scholar search",
          description: "Paper search, citation context, and related-work discovery.",
          trust: "external_verified",
          cost: "free",
          network: "required",
          allowed_stages: ["literature", "verification"],
        }),
        capability({
          name: "mcp.arxiv",
          type: "mcp",
          substrate: "external_mcp",
          title: "arXiv search",
          description: "Preprint search and source metadata lookup.",
          trust: "external_verified",
          cost: "free",
          network: "required",
          allowed_stages: ["literature", "verification"],
        }),
      ],
    }),
    pack({
      id: "crawler-data",
      title: "Crawler and web data acquisition",
      description: "Built-in web data acquisition capability with Scrapling-first crawler policy and ledger gates.",
      default_enabled: true,
      install_policy: "built_in",
      capabilities: [
        capability({
          name: "python.web-crawler.scrapling",
          type: "python_tool",
          substrate: "python",
          title: "Scrapling crawler bridge",
          description: "Scrapling-first crawling and extraction bridge with robots, rate-limit, and license diagnostics.",
          trust: "local_generated",
          cost: "free",
          network: "required",
          allowed_stages: ["data", "literature", "verification"],
        }),
        capability({
          name: "mcp.scrapling",
          type: "mcp",
          substrate: "external_mcp",
          title: "Scrapling MCP",
          description: "Optional Scrapling MCP server for crawl jobs and extraction replay.",
          trust: "external_verified",
          cost: "variable",
          network: "required",
          allowed_stages: ["data", "verification"],
        }),
        capability({
          name: "skill.bb-browser",
          type: "skill",
          substrate: "codex_skill",
          title: "Managed browser acquisition",
          description:
            "Paper Fucker managed browser and web-data acquisition skill for authorized public or user-approved private research sources.",
          trust: "external_verified",
          cost: "free",
          network: "required",
          allowed_stages: ["literature", "data", "verification"],
        }),
      ],
    }),
    pack({
      id: "huggingface-research",
      title: "Hugging Face research loop",
      description: "ML-Intern-inspired Hugging Face docs, papers, datasets, Spaces, models, jobs, and experiment traces.",
      default_enabled: true,
      install_policy: "user_configured_secret",
      capabilities: [
        capability({
          name: "hf.docs",
          type: "mcp",
          substrate: "external_mcp",
          title: "Hugging Face docs search",
          description: "Hugging Face documentation retrieval for ML methods and APIs.",
          trust: "external_verified",
          cost: "free",
          network: "required",
          allowed_stages: ["literature", "experiment_design", "verification"],
        }),
        capability({
          name: "hf.papers",
          type: "mcp",
          substrate: "external_mcp",
          title: "Hugging Face papers",
          description: "Hugging Face paper page search and metadata retrieval.",
          trust: "external_verified",
          cost: "free",
          network: "required",
          allowed_stages: ["literature", "verification"],
        }),
        capability({
          name: "hf.datasets",
          type: "mcp",
          substrate: "external_mcp",
          title: "Hugging Face datasets",
          description: "Dataset discovery, cards, split metadata, and license/source verification.",
          trust: "external_verified",
          cost: "free",
          network: "required",
          allowed_stages: ["data", "experiment_design", "verification"],
        }),
        capability({
          name: "hf.models",
          type: "mcp",
          substrate: "external_mcp",
          title: "Hugging Face models",
          description: "Model card discovery, pipeline metadata, and baseline/model provenance lookup.",
          trust: "external_verified",
          cost: "free",
          network: "required",
          allowed_stages: ["literature", "experiment_design", "verification"],
        }),
        capability({
          name: "hf.spaces",
          type: "mcp",
          substrate: "external_mcp",
          title: "Hugging Face Spaces",
          description: "Demo, benchmark, and interactive artifact discovery for related methods and reproducibility hints.",
          trust: "external_verified",
          cost: "free",
          network: "required",
          allowed_stages: ["literature", "experiment_design", "verification"],
        }),
        capability({
          name: "hf.jobs",
          type: "mcp",
          substrate: "external_mcp",
          title: "Hugging Face Jobs",
          description: "Approved remote experiment jobs and log collection.",
          trust: "external_verified",
          cost: "variable",
          network: "required",
          allowed_stages: ["experiment_execution", "reproduction"],
        }),
        capability({
          name: "hf.trackio",
          type: "mcp",
          substrate: "external_mcp",
          title: "Hugging Face Trackio",
          description: "Experiment metric traces and training logs for HF-backed research runs.",
          trust: "external_verified",
          cost: "variable",
          network: "required",
          allowed_stages: ["experiment_execution", "reproduction", "verification"],
        }),
      ],
    }),
    pack({
      id: "code-experiment-core",
      title: "Code and experiment core",
      description: "Paper Fucker local tool substrate and Python tools for code analysis, shell execution, notebooks, logs, and datasets.",
      default_enabled: true,
      install_policy: "built_in",
      capabilities: [
        capability({
          name: "opencode.read",
          type: "builtin_tool",
          substrate: "opencode",
          title: "Paper Fucker read",
          description: "Read source files and paper materials through the Paper Fucker local tool substrate.",
          trust: "first_party",
          cost: "free",
          network: "none",
          allowed_stages: ["intake", "code_analysis", "verification"],
        }),
        capability({
          name: "opencode.grep",
          type: "builtin_tool",
          substrate: "opencode",
          title: "Paper Fucker search",
          description: "Search source and document text through the Paper Fucker local tool substrate.",
          trust: "first_party",
          cost: "free",
          network: "none",
          allowed_stages: ["code_analysis", "verification"],
        }),
        capability({
          name: "opencode.glob",
          type: "builtin_tool",
          substrate: "opencode",
          title: "Paper Fucker file discovery",
          description: "Discover workspace files for intake, code analysis, and export packaging.",
          trust: "first_party",
          cost: "free",
          network: "none",
          allowed_stages: ["intake", "code_analysis", "export"],
        }),
        capability({
          name: "opencode.task",
          type: "builtin_tool",
          substrate: "opencode",
          title: "Paper Fucker agent task",
          description: "Delegate bounded code analysis or verification work through Paper Fucker agents.",
          trust: "first_party",
          cost: "variable",
          network: "optional",
          allowed_stages: ["planning", "code_analysis", "verification", "revision"],
        }),
        capability({
          name: "opencode.shell",
          type: "builtin_tool",
          substrate: "opencode",
          title: "Paper Fucker shell",
          description: "Run approved local commands for diagnostics, experiments, and export rendering.",
          trust: "first_party",
          cost: "free",
          network: "optional",
          allowed_stages: ["experiment_execution", "reproduction", "export"],
        }),
        capability({
          name: "skill.jupyter-notebook",
          type: "skill",
          substrate: "codex_skill",
          title: "Jupyter notebook skill",
          description: "Generate and maintain exploratory notebooks for experiment design and analysis.",
          trust: "local_generated",
          cost: "free",
          network: "none",
          allowed_stages: ["experiment_design", "experiment_execution", "reproduction"],
        }),
        capability({
          name: "python.experiment-log-parse",
          type: "python_tool",
          substrate: "python",
          title: "Experiment log parser",
          description: "Parse experiment logs and extract structured metric records.",
          trust: "local_generated",
          cost: "free",
          network: "none",
          allowed_stages: ["experiment_execution", "reproduction", "verification"],
        }),
        capability({
          name: "python.dataset-metadata-probe",
          type: "python_tool",
          substrate: "python",
          title: "Dataset metadata probe",
          description: "Inspect dataset files and derive structured metadata and diagnostics.",
          trust: "local_generated",
          cost: "free",
          network: "none",
          allowed_stages: ["data", "experiment_execution", "verification"],
        }),
      ],
    }),
    pack({
      id: "writing-verification-export",
      title: "Writing, verification, and export",
      description: "First-party ClaimLedger, source ledger, review gate, revision, and export bundle capabilities.",
      default_enabled: true,
      install_policy: "built_in",
      capabilities: [
        capability({
          name: "paper.claim-ledger",
          type: "first_party_tool",
          substrate: "paper_fucker",
          title: "ClaimLedger writer",
          description: "Create, update, and verify ClaimLedger entries before draft generation.",
          trust: "first_party",
          cost: "free",
          network: "none",
          allowed_stages: ["claim_ledger", "drafting", "verification"],
        }),
        capability({
          name: "paper.source-ledger",
          type: "first_party_tool",
          substrate: "paper_fucker",
          title: "SourceLedger verifier",
          description: "Verify source ranges, licenses, and source-to-claim links.",
          trust: "first_party",
          cost: "free",
          network: "none",
          allowed_stages: ["literature", "data", "claim_ledger", "verification"],
        }),
        capability({
          name: "paper.review-gate",
          type: "first_party_tool",
          substrate: "paper_fucker",
          title: "Authenticity review gate",
          description: "Run claim, citation, source, license, data, and reproduction checks before final export.",
          trust: "first_party",
          cost: "free",
          network: "optional",
          allowed_stages: ["verification", "revision", "export"],
        }),
        capability({
          name: "paper.export-bundle",
          type: "first_party_tool",
          substrate: "paper_fucker",
          title: "Paper export bundle",
          description: "Build final and forced-draft paper bundles from verified run artifacts.",
          trust: "first_party",
          cost: "free",
          network: "none",
          allowed_stages: ["export", "verification"],
        }),
      ],
    }),
  ]
}

export function builtinResearchCapabilities() {
  const seen = new Set<string>()
  const capabilities: ResearchCapability[] = []
  for (const packItem of builtinPaperCapabilityPacks()) {
    for (const item of packItem.capabilities) {
      if (seen.has(item.name)) continue
      seen.add(item.name)
      capabilities.push(item)
    }
  }
  return capabilities
}

export function capabilityPacksForStage(stage: PaperCapabilityStage) {
  return builtinPaperCapabilityPacks().filter((packItem) => packItem.stages.includes(stage))
}
