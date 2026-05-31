export async function readTuiJsonResponse<T>(response: Response, label: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    const detail = text.trim()
    throw new Error(`${label}: HTTP ${response.status}${detail ? ` - ${detail.slice(0, 240)}` : ""}`)
  }
  if (!text.trim()) throw new Error(`${label}: 服务返回空响应。`)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${label}: 服务返回的不是 JSON，请查看 PaperCode 日志。`)
  }
}
