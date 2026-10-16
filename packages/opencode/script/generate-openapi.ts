#!/usr/bin/env bun
/**
 * Emit the OpenAPI document the SDK build consumes. `httpapi` (default) derives it from the Effect
 * HttpApi contract via `Server.openapi()`; `hono` returns the legacy Hono spec for parity diffs.
 */
import { Server } from "../src/server/server"

const source = process.argv[2] === "hono" ? "hono" : "httpapi"
const doc = source === "hono" ? await Server.openapiHono() : await Server.openapi()
process.stdout.write(JSON.stringify(doc, null, 2))
