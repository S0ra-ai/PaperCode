import {
  SpanStatusCode,
  context,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api"

const tracer = trace.getTracer("paper_fucker.research", "0.1.0")

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function recordFailure(span: Span, error: unknown) {
  span.recordException(error instanceof Error ? error : new Error(errorMessage(error)))
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: errorMessage(error),
  })
}

export function withSpan<T>(name: string, attributes: Attributes, fn: (span: Span) => T): T {
  const span = tracer.startSpan(name, { attributes })
  return context.with(trace.setSpan(context.active(), span), () => {
    try {
      const result = fn(span)
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            span.end()
            return value
          },
          (error) => {
            recordFailure(span, error)
            span.end()
            throw error
          },
        ) as T
      }
      span.end()
      return result
    } catch (error) {
      recordFailure(span, error)
      span.end()
      throw error
    }
  })
}

export const contractAttributes = (input: {
  kind: string
  schemaVersion?: string
}) => ({
  "paper_fucker.research.contract.kind": input.kind,
  ...(input.schemaVersion ? { "paper_fucker.research.schema_version": input.schemaVersion } : {}),
})

export * as ResearchTelemetry from "./telemetry"
