import {
  ResearchCapabilityRegistry,
  createResearchCapabilityRegistry,
  type PaperCapabilityStage,
  type ResearchCapability,
  type ResearchCapabilityFilter,
} from "./capabilities"
import {
  builtinPaperCapabilityPacks,
  builtinResearchCapabilities,
  capabilityPacksForStage,
  type PaperCapabilityPack,
} from "./capability-pack"

export interface PaperCapabilityRegistrySnapshot {
  schema_version: "PaperCapabilityRegistry.v1"
  capabilities: ResearchCapability[]
  packs: PaperCapabilityPack[]
  by_stage: Record<PaperCapabilityStage, string[]>
}

export function createPaperCapabilityRegistry(input?: {
  capabilities?: ResearchCapability[]
  packs?: PaperCapabilityPack[]
}) {
  const packs = input?.packs ?? builtinPaperCapabilityPacks()
  const capabilities = input?.capabilities ?? builtinResearchCapabilities()
  return {
    registry: createResearchCapabilityRegistry(capabilities),
    packs,
  }
}

export function snapshotPaperCapabilityRegistry(input?: {
  registry?: ResearchCapabilityRegistry
  packs?: PaperCapabilityPack[]
}): PaperCapabilityRegistrySnapshot {
  const registry = input?.registry ?? createResearchCapabilityRegistry(builtinResearchCapabilities())
  const packs = input?.packs ?? builtinPaperCapabilityPacks()
  const byStage = {} as Record<PaperCapabilityStage, string[]>
  for (const packItem of packs) {
    for (const stage of packItem.stages) {
      byStage[stage] ??= []
      byStage[stage].push(...packItem.capability_names.filter((name) => registry.forStage(stage).some((item) => item.name === name)))
      byStage[stage] = Array.from(new Set(byStage[stage]))
    }
  }
  return {
    schema_version: "PaperCapabilityRegistry.v1",
    capabilities: registry.list(),
    packs,
    by_stage: byStage,
  }
}

export function capabilitiesForStage(
  stage: PaperCapabilityStage,
  input: { filter?: ResearchCapabilityFilter; registry?: ResearchCapabilityRegistry } = {},
) {
  const registry = input.registry ?? createResearchCapabilityRegistry(builtinResearchCapabilities())
  return {
    stage,
    packs: capabilityPacksForStage(stage),
    capabilities: registry.forStage(stage, input.filter),
  }
}
