import { $ } from "bun"

await $`bun ./scripts/copy-icons.ts ${process.env.PAPER_FUCKER_CHANNEL ?? process.env.OPENCODE_CHANNEL ?? "dev"}`

await $`cd ../opencode && bun script/build-node.ts`
