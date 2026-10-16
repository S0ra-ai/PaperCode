import { describe, expect, test } from "bun:test"
import {
  BUILTIN_PAPER_PROFILE_IDS,
  ACTIVE_PAPER_PROFILE_IDS,
  createPaperProfileRegistry,
  defaultPaperProfiles,
  resolvePaperProfileSelection,
  type PaperProfileCheck,
} from "@/paper"

describe("paper profile registry", () => {
  test("registers the built-in paper profile ids", () => {
    expect(BUILTIN_PAPER_PROFILE_IDS).toEqual([
      "nature-paper",
      "cjc-paper",
      "ieee-paper",
      "acm-paper",
      "springer-paper",
      "generic-preprint",
      "custom-journal",
    ])

    const registry = createPaperProfileRegistry(defaultPaperProfiles())
    expect(registry.list().map((profile) => profile.id)).toEqual(Array.from(BUILTIN_PAPER_PROFILE_IDS))
  })

  test("models Nature as a runtime-refreshed profile instead of frozen hardcoded guidance", () => {
    const natureProfile = createPaperProfileRegistry(defaultPaperProfiles()).get("nature-paper")

    expect(natureProfile).toMatchObject({
      id: "nature-paper",
      title: "Nature Portfolio paper",
      skill_id: "nature-paper",
      guidance_refresh_policy: "fetch_current_official_guidance",
      schema_version: "PaperProfile.v1",
    })
    expect(natureProfile.official_guidance_sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Nature Portfolio author guidance", trust: "official" }),
      ]),
    )
    expect(natureProfile.required_checks.map((check) => check.id)).toEqual(
      expect.arrayContaining([
        "abstract",
        "introduction",
        "results",
        "methods",
        "data-availability",
        "code-availability",
        "ethics",
        "competing-interests",
        "figures-tables",
        "references",
        "supplementary-material",
      ]),
    )
  })

  test("returns profile check output that can feed the authenticity gate", () => {
    const registry = createPaperProfileRegistry(defaultPaperProfiles())
    const check = registry.check("nature-paper", {
      sections: ["abstract", "introduction", "results"],
      statements: ["data-availability"],
    })

    expect(check satisfies PaperProfileCheck).toMatchObject({
      schema_version: "PaperProfileCheck.v1",
      profile_id: "nature-paper",
      status: "blocked",
    })
    expect(check.blockers.map((blocker) => blocker.check_id)).toEqual(
      expect.arrayContaining(["methods", "code-availability", "ethics", "competing-interests"]),
    )
    expect(check.warnings.map((warning) => warning.check_id)).toContain("supplementary-material")
  })

  test("models Chinese Journal of Computers as a runtime-refreshed official-template profile", () => {
    const cjcProfile = createPaperProfileRegistry(defaultPaperProfiles()).get("cjc-paper")

    expect(cjcProfile).toMatchObject({
      id: "cjc-paper",
      title: "计算机学报（Chinese Journal of Computers）",
      guidance_refresh_policy: "fetch_current_official_guidance",
      template_strategy: "official_template_first",
    })
    expect(cjcProfile.official_guidance_sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "计算机学报官网",
          url: "https://cjc.ict.ac.cn/",
          trust: "official",
          refresh: "runtime",
        }),
      ]),
    )
    expect(cjcProfile.required_checks.map((check) => check.id)).toEqual(
      expect.arrayContaining(["chinese-title-abstract-keywords", "english-title-abstract-keywords", "official-cjc-template"]),
    )
  })

  test("uses CJC as the only active journal profile while discovery is disabled", () => {
    expect(ACTIVE_PAPER_PROFILE_IDS).toEqual(["cjc-paper"])

    expect(resolvePaperProfileSelection({})).toMatchObject({
      profile_id: "cjc-paper",
      journal_name: "中国计算机学报",
    })

    const selection = resolvePaperProfileSelection({
      target_journal: "Journal of Unknown Systems",
      target_journal_url: "https://example.org/authors",
    })

    expect(selection.profile_id).toBe("cjc-paper")
    expect(selection.journal_name).toBe("中国计算机学报")
    expect(selection.generated_profile).toBeUndefined()
  })

  test("installs a first-party nature-paper skill with runtime official-source refresh instructions", async () => {
    const skillUrl = new URL("../../../../.papercode/skills/nature-paper/SKILL.md", import.meta.url)
    const skill = await Bun.file(skillUrl).text()

    expect(skill).toContain("name: nature-paper")
    expect(skill).toContain("Fetch current official Nature Portfolio guidance")
    expect(skill).toContain("PaperProfile.v1")
    expect(skill).toContain("Do not treat this skill as a frozen copy of Nature rules")
  })
})
