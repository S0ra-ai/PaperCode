import { describe, expect, test } from "bun:test"
import { dict as en } from "./en"
import { dict as zh } from "./zh"
import { dict as zht } from "./zht"

const dictionaries = {
  en,
  zh,
  zht,
}

describe("PaperCode app i18n surface", () => {
  test("primary prompt copy is PaperRun and research oriented", () => {
    expect(en["prompt.mode.normal"]).toBe("PaperRun")
    expect(zh["prompt.mode.normal"]).toBe("PaperRun")
    expect(zht["prompt.mode.normal"]).toBe("PaperRun")

    expect(en["prompt.placeholder.simple"]).toContain("research goal")
    expect(zh["prompt.placeholder.simple"]).toContain("研究目标")
    expect(zht["prompt.placeholder.simple"]).toContain("研究目標")

    expect(en["prompt.example.1"]).toContain("Chinese Journal of Computers")
    expect(zh["prompt.example.1"]).toContain("计算机学报")
    expect(zht["prompt.example.1"]).toContain("計算機學報")
  })

  test("high-frequency navigation, toast, and session labels use PaperRun wording", () => {
    type EnKey = keyof typeof en
    const keys: EnKey[] = [
      "session.child.promptDisabled",
      "prompt.toast.sessionCreateFailed.title",
      "prompt.toast.promptSendFailed.description",
      "context.stats.session",
      "toast.model.none.description",
      "toast.session.share.success.title",
      "toast.session.share.failed.title",
      "toast.session.unshare.success.title",
      "toast.session.listFailed.title",
      "notification.action.goToSession",
      "notification.session.error.title",
      "session.tab.session",
      "session.review.empty",
      "session.review.noSnapshot",
      "session.new.title",
      "sidebar.nav.projectsAndSessions",
      "sidebar.project.recentSessions",
      "settings.general.row.showSessionProgressBar.title",
      "settings.shortcuts.group.session",
      "session.delete.title",
      "workspace.reset.archived.many",
    ]

    const legacyWords = /session|Session|会话|工作階段/

    for (const key of keys) {
      expect(en[key], `en:${key}`).toContain("PaperRun")
      expect(en[key], `en:${key}`).not.toMatch(legacyWords)

      const zhValue = (zh as Partial<Record<EnKey, string>>)[key]
      const zhtValue = (zht as Partial<Record<EnKey, string>>)[key]
      if (zhValue !== undefined) {
        expect(zhValue, `zh:${key}`).toContain("PaperRun")
        expect(zhValue, `zh:${key}`).not.toMatch(legacyWords)
      }
      if (zhtValue !== undefined) {
        expect(zhtValue, `zht:${key}`).toContain("PaperRun")
        expect(zhtValue, `zht:${key}`).not.toMatch(legacyWords)
      }
    }
  })

  test("visible values do not reintroduce legacy chat or subscription branding", () => {
    const forbidden =
      /Ask anything|随便问|隨便問|OpenCode|anomalyco|papercode provider|papercode\.local\/zen|低成本订阅|低成本訂閱|(^|[^A-Za-z])session(s)?([^A-Za-z]|$)|Session|会话|工作階段|聊天|\bchat\b|\bChat\b/i

    for (const [locale, dict] of Object.entries(dictionaries)) {
      for (const [key, value] of Object.entries(dict)) {
        const visibleValue = value.replace(/\{\{[^}]+\}\}/g, "")
        expect(visibleValue, `${locale}:${key}`).not.toMatch(forbidden)
      }
    }
  })
})
