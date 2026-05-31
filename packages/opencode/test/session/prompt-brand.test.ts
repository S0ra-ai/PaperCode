import { describe, expect, test } from "bun:test"

const brandedPrompts = [
  "anthropic.txt",
  "beast.txt",
  "copilot-gpt-5.txt",
  "default.txt",
  "gemini.txt",
  "trinity.txt",
] as const

describe("session prompt branding", () => {
  for (const prompt of brandedPrompts) {
    test(`${prompt} uses PaperCode product identity`, async () => {
      const text = await Bun.file(new URL(`../../src/session/prompt/${prompt}`, import.meta.url)).text()

      expect(text).toContain("PaperCode")
      expect(text).not.toMatch(/\bopencode\b/i)
      expect(text).not.toContain("anomalyco/opencode")
      expect(text).not.toContain("github.com/anomalyco")
    })
  }
})
