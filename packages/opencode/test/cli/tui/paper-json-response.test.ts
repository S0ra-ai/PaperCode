import { describe, expect, test } from "bun:test"
import { readTuiJsonResponse } from "../../../src/cli/cmd/tui/util/http"
import { submitPaperWorkbenchPrompt } from "../../../src/cli/cmd/tui/routes/paper/workbench"

describe("PaperCode TUI JSON response handling", () => {
  test("turns non-JSON service responses into Chinese diagnostics", async () => {
    await expect(
      readTuiJsonResponse(new Response("<html>not json</html>", { status: 200 }), "模型工作台读取失败"),
    ).rejects.toThrow("服务返回的不是 JSON")
  })

  test("does not surface native JSON parse errors from PaperRun submit", async () => {
    await expect(
      submitPaperWorkbenchPrompt({
        baseUrl: "http://localhost:4096",
        prompt: { input: "测试主题", parts: [] },
        fetch: async () => new Response("not-json", { status: 200 }),
      }),
    ).rejects.toThrow("PaperRun 创建失败: 服务返回的不是 JSON")
  })
})
