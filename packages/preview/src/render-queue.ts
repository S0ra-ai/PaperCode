import type { PreviewArtifactRef, PreviewRenderStatus, PreviewSnapshot, PreviewStreamEvent } from "./protocol"

export type PreviewRenderer = (input: {
  markdown: string
  signal: AbortSignal
  job_id: string
}) => Promise<Partial<PreviewSnapshot["artifacts"]>>

export type PreviewSubscriber = (event: PreviewStreamEvent) => void

function now() {
  return new Date().toISOString()
}

function artifact(kind: PreviewArtifactRef["kind"], content: string, mime_type: string): PreviewArtifactRef {
  return {
    kind,
    content,
    mime_type,
    updated_at: now(),
  }
}

export const defaultRenderer: PreviewRenderer = async ({ markdown, signal }) => {
  await Bun.sleep(5)
  if (signal.aborted) throw new DOMException("Render job cancelled.", "AbortError")
  return {
    markdown: artifact("markdown", markdown, "text/markdown"),
    latex: artifact("latex", `% Generated preview\n${markdown}`, "text/x-tex"),
    pdf: artifact("pdf", "PDF render queued; open artifact path when available.", "text/plain"),
    docx: artifact("docx", "DOCX render queued; open artifact path when available.", "text/plain"),
  }
}

export class PreviewRenderQueue {
  private controller?: AbortController
  private sequence = 0
  private subscribers = new Set<PreviewSubscriber>()

  constructor(
    private snapshot: PreviewSnapshot,
    private renderer: PreviewRenderer = defaultRenderer,
  ) {}

  current() {
    return this.snapshot
  }

  subscribe(subscriber: PreviewSubscriber) {
    this.subscribers.add(subscriber)
    subscriber({ type: "snapshot", snapshot: this.snapshot })
    return () => this.subscribers.delete(subscriber)
  }

  private publish(event: PreviewStreamEvent) {
    for (const subscriber of this.subscribers) subscriber(event)
  }

  private setRender(render: PreviewRenderStatus) {
    this.snapshot = {
      ...this.snapshot,
      updated_at: render.updated_at,
      render,
    }
    this.publish({ type: "render", render })
  }

  async enqueueMarkdown(markdown: string) {
    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    const job_id = `render-${++this.sequence}`
    this.snapshot = {
      ...this.snapshot,
      updated_at: now(),
      artifacts: {
        ...this.snapshot.artifacts,
        markdown: artifact("markdown", markdown, "text/markdown"),
      },
    }
    this.setRender({ state: "queued", job_id, stage: "markdown", updated_at: now() })
    this.publish({ type: "snapshot", snapshot: this.snapshot })
    try {
      this.setRender({ state: "rendering", job_id, stage: "derived", updated_at: now() })
      const artifacts = await this.renderer({ markdown, signal: controller.signal, job_id })
      if (controller.signal.aborted) {
        this.setRender({ state: "cancelled", job_id, stage: "derived", updated_at: now() })
        return this.snapshot
      }
      this.snapshot = {
        ...this.snapshot,
        updated_at: now(),
        artifacts: {
          ...this.snapshot.artifacts,
          ...artifacts,
        },
      }
      this.setRender({ state: "ready", job_id, stage: "derived", updated_at: now() })
      this.publish({ type: "snapshot", snapshot: this.snapshot })
      return this.snapshot
    } catch (error) {
      if (controller.signal.aborted) {
        this.setRender({ state: "cancelled", job_id, stage: "derived", updated_at: now() })
        return this.snapshot
      }
      this.setRender({
        state: "failed",
        job_id,
        stage: "derived",
        message: error instanceof Error ? error.message : String(error),
        updated_at: now(),
      })
      return this.snapshot
    }
  }
}
