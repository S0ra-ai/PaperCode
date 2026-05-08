import path from "path"
import { fileURLToPath } from "url"
import { createPreviewToken, isWriteMethod, type PreviewSnapshot, type PreviewStreamEvent } from "./protocol"
import { PreviewRenderQueue } from "./render-queue"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(dirname, "..")

export type PreviewServerOptions = {
  snapshot: PreviewSnapshot
  token?: string
  hostname?: string
  port?: number
}

export type PreviewServerHandle = {
  server: ReturnType<typeof Bun.serve>
  queue: PreviewRenderQueue
  token: string
  url: string
  stop: () => void
}

function json(value: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(value, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  })
}

function tokenFrom(url: URL) {
  return url.searchParams.get("token") ?? ""
}

function authorized(url: URL, token: string) {
  return tokenFrom(url) === token
}

function asset(file: string, contentType: string) {
  return new Response(Bun.file(file), {
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
    },
  })
}

function sse(queue: PreviewRenderQueue) {
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: PreviewStreamEvent) => {
        controller.enqueue(`event: ${event.type}\n`)
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
      }
      const unsubscribe = queue.subscribe(send)
      return () => unsubscribe()
    },
  })
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  })
}

export function startPreviewServer(options: PreviewServerOptions): PreviewServerHandle {
  const token = options.token ?? createPreviewToken()
  const queue = new PreviewRenderQueue(options.snapshot)
  const hostname = options.hostname ?? "127.0.0.1"
  const server = Bun.serve({
    hostname,
    port: options.port ?? 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (isWriteMethod(request.method)) return json({ error: "Preview is read-only." }, { status: 405 })
      if (url.pathname === "/assets/client.js") return asset(path.join(dirname, "client.js"), "text/javascript; charset=utf-8")
      if (url.pathname === "/assets/style.css") return asset(path.join(dirname, "style.css"), "text/css; charset=utf-8")
      if (!authorized(url, token)) return json({ error: "Invalid preview token." }, { status: 401 })
      if (url.pathname === "/" || url.pathname === "/preview") {
        return asset(path.join(packageRoot, "index.html"), "text/html; charset=utf-8")
      }
      if (url.pathname === "/api/snapshot") return json(queue.current())
      if (url.pathname === "/events") return sse(queue)
      return json({ error: "Not found." }, { status: 404 })
    },
  })
  return {
    server,
    queue,
    token,
    url: `http://${hostname}:${server.port}/preview?token=${encodeURIComponent(token)}`,
    stop: () => server.stop(true),
  }
}
