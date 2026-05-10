export type BudgetTier = "quick" | "standard" | "deep" | "submission" | "custom"

export interface BudgetTierPolicy {
  tier: BudgetTier
  max_depth: null
  depth_policy: "unbounded"
  max_parallel: number
  cost_cap_usd: number
  live_search: "limited" | "enabled" | "broad"
  container_reproduction: boolean
}

const POLICIES: Record<BudgetTier, BudgetTierPolicy> = {
  quick: {
    tier: "quick",
    max_depth: null,
    depth_policy: "unbounded",
    max_parallel: 2,
    cost_cap_usd: 1,
    live_search: "limited",
    container_reproduction: false,
  },
  standard: {
    tier: "standard",
    max_depth: null,
    depth_policy: "unbounded",
    max_parallel: 4,
    cost_cap_usd: 5,
    live_search: "enabled",
    container_reproduction: false,
  },
  deep: {
    tier: "deep",
    max_depth: null,
    depth_policy: "unbounded",
    max_parallel: 6,
    cost_cap_usd: 20,
    live_search: "broad",
    container_reproduction: true,
  },
  submission: {
    tier: "submission",
    max_depth: null,
    depth_policy: "unbounded",
    max_parallel: 8,
    cost_cap_usd: 50,
    live_search: "broad",
    container_reproduction: true,
  },
  custom: {
    tier: "custom",
    max_depth: null,
    depth_policy: "unbounded",
    max_parallel: 8,
    cost_cap_usd: 0,
    live_search: "broad",
    container_reproduction: true,
  },
}

export function budgetTierPolicy(tier: BudgetTier, custom?: Partial<BudgetTierPolicy>): BudgetTierPolicy {
  return {
    ...POLICIES[tier],
    ...(tier === "custom" ? custom : {}),
  }
}
