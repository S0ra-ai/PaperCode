function charWidth(char: string) {
  const code = char.codePointAt(0) ?? 0
  if (code === 0) return 0
  if (code < 32 || (code >= 0x7f && code < 0xa0)) return 0
  if (
    code >= 0x1100 &&
    (code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x3fffd))
  ) {
    return 2
  }
  return 1
}

export function displayWidth(value: string) {
  let width = 0
  for (const char of Array.from(value)) width += charWidth(char)
  return width
}

function takeByWidth(chars: string[], maxWidth: number, fromEnd = false) {
  const output: string[] = []
  let width = 0
  const list = fromEnd ? [...chars].reverse() : chars
  for (const char of list) {
    const nextWidth = charWidth(char)
    if (width + nextWidth > maxWidth) break
    if (fromEnd) output.unshift(char)
    else output.push(char)
    width += nextWidth
  }
  return output.join("")
}

export function truncateDisplayMiddle(value: string, maxWidth: number) {
  if (maxWidth <= 0) return ""
  if (displayWidth(value) <= maxWidth) return value
  if (maxWidth <= 3) return "…"
  const chars = Array.from(value)
  const headWidth = Math.max(4, Math.floor((maxWidth - 1) * 0.58))
  const tailWidth = Math.max(3, maxWidth - headWidth - 1)
  return `${takeByWidth(chars, headWidth)}…${takeByWidth(chars, tailWidth, true)}`
}
