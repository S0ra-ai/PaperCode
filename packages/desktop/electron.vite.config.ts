import { sentryVitePlugin } from "@sentry/vite-plugin"
import { defineConfig } from "electron-vite"
import appPlugin from "@opencode-ai/app/vite"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createRequire } from "node:module"

const channel = (() => {
  const raw = process.env.PAPERCODE_CHANNEL ?? process.env.OPENCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

const PAPERCODE_SERVER_DIST = "../opencode/dist/node"
// The main process is bundled as ESM, which cannot load jsonc-parser's UMD build; point the import at
// the ESM entry instead. jsonc-parser is a dependency of the opencode package, so it is resolved
// through that package rather than by path, which keeps the store layout out of this file.
const resolveFromOpencode = createRequire(path.resolve("../opencode/package.json"))
const JSONC_PARSER_ESM = resolveFromOpencode.resolve("jsonc-parser/lib/esm/main.js")

const nodePtyPkg = `@lydell/node-pty-${process.platform}-${process.arch}`

const sentry =
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        telemetry: false,
        release: {
          name: process.env.SENTRY_RELEASE ?? process.env.VITE_SENTRY_RELEASE,
        },
        sourcemaps: {
          assets: "./out/renderer/**",
          filesToDeleteAfterUpload: "./out/renderer/**/*.map",
        },
      })
    : false

export default defineConfig({
  main: {
    define: {
      "import.meta.env.PAPERCODE_CHANNEL": JSON.stringify(channel),
      "import.meta.env.OPENCODE_CHANNEL": JSON.stringify(channel),
    },
    build: {
      rollupOptions: {
        input: { index: "src/main/index.ts", sidecar: "src/main/sidecar.ts" },
        external: ["opencode-web-ui.gen.ts"],
      },
      externalizeDeps: { include: [nodePtyPkg] },
    },
    plugins: [
      {
        name: "papercode:jsonc-parser-esm",
        enforce: "pre",
        resolveId(id) {
          if (id === "jsonc-parser") return JSONC_PARSER_ESM
        },
      },
      {
        name: "papercode:node-pty-narrower",
        enforce: "pre",
        resolveId(s) {
          if (s === "@lydell/node-pty") return nodePtyPkg
        },
      },
      {
        name: "papercode:virtual-server-module",
        enforce: "pre",
        resolveId(id) {
          if (id === "virtual:opencode-server") return this.resolve(`${PAPERCODE_SERVER_DIST}/node.js`)
        },
      },
      {
        name: "papercode:copy-server-assets",
        async writeBundle() {
          for (const l of await fs.readdir(PAPERCODE_SERVER_DIST)) {
            if (!l.endsWith(".wasm")) continue
            await fs.writeFile(`./out/main/chunks/${l}`, await fs.readFile(`${PAPERCODE_SERVER_DIST}/${l}`))
          }
        },
      },
    ],
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts" },
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    plugins: [appPlugin, sentry],
    publicDir: "../../../app/public",
    root: "src/renderer",
    define: {
      "import.meta.env.VITE_PAPERCODE_CHANNEL": JSON.stringify(channel),
      "import.meta.env.VITE_OPENCODE_CHANNEL": JSON.stringify(channel),
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          main: "src/renderer/index.html",
          loading: "src/renderer/loading.html",
        },
      },
    },
  },
})
