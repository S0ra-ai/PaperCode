import { describe, expect, test } from "bun:test"
import { sessionTitle } from "./session-title"

describe("sessionTitle", () => {
  test("strips PaperRun timestamp suffixes from default titles", () => {
    expect(sessionTitle("New PaperRun - 2026-05-31T12:34:56.789Z")).toBe("New PaperRun")
    expect(sessionTitle("Child PaperRun - 2026-05-31T12:34:56.789Z")).toBe("Child PaperRun")
  })

  test("keeps legacy titles readable for existing local data", () => {
    expect(sessionTitle("New session - 2026-05-31T12:34:56.789Z")).toBe("New session")
    expect(sessionTitle("Child session - 2026-05-31T12:34:56.789Z")).toBe("Child session")
  })

  test("leaves custom titles unchanged", () => {
    expect(sessionTitle("文本到动作实验复现")).toBe("文本到动作实验复现")
  })
})
