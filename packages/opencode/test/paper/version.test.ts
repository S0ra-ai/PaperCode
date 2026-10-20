import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { localChangelogPath, parseChangelogVersion } from "@/version"

describe("product version", () => {
  test("reads the version marker from the changelog", () => {
    expect(parseChangelogVersion(":project X\n:version   0.13.0.185-dev\n\n:history")).toBe("0.13.0.185-dev")
    expect(parseChangelogVersion("no marker here")).toBeUndefined()
    expect(parseChangelogVersion(":version   \n")).toBeUndefined()
  })

  test("the repository changelog carries a release version", () => {
    const value = parseChangelogVersion(readFileSync(localChangelogPath(), "utf8"))
    expect(value).toMatch(/^\d+\.\d+/)
  })
})
