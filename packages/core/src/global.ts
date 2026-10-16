import path from "path"
import fs from "fs/promises"
import os from "os"
import { Context, Effect, Layer } from "effect"
import { Flock } from "./util/flock"
import { Flag } from "./flag/flag"

const app = "papercode"
const homeDirName = ".papercode"
const overrides: Partial<Record<keyof Interface, string>> = {}
const initialTestHome = envPath(process.env.PAPERCODE_TEST_HOME)

function envPath(value: string | undefined) {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined
  return trimmed
}

function home() {
  return envPath(overrides.home) ?? envPath(process.env.PAPERCODE_TEST_HOME) ?? initialTestHome ?? os.homedir()
}

function root() {
  return path.join(home(), homeDirName)
}

const paths = {
  get home() {
    return home()
  },
  set home(value: string) {
    overrides.home = value
  },
  get data() {
    return overrides.data ?? path.join(root(), "data")
  },
  set data(value: string) {
    overrides.data = value
  },
  get bin() {
    return overrides.bin ?? path.join(paths.cache, "bin")
  },
  set bin(value: string) {
    overrides.bin = value
  },
  get log() {
    return overrides.log ?? path.join(paths.data, "log")
  },
  set log(value: string) {
    overrides.log = value
  },
  get cache() {
    return overrides.cache ?? path.join(root(), "cache")
  },
  set cache(value: string) {
    overrides.cache = value
  },
  get config() {
    return overrides.config ?? path.join(root(), "config")
  },
  set config(value: string) {
    overrides.config = value
  },
  get state() {
    return overrides.state ?? path.join(root(), "state")
  },
  set state(value: string) {
    overrides.state = value
  },
  get tmp() {
    return overrides.tmp ?? path.join(os.tmpdir(), app)
  },
  set tmp(value: string) {
    overrides.tmp = value
  },
}

export const Path = paths

Flock.setGlobal({ state: Path.state })

await Promise.all([
  fs.mkdir(Path.data, { recursive: true }),
  fs.mkdir(Path.config, { recursive: true }),
  fs.mkdir(Path.state, { recursive: true }),
  fs.mkdir(Path.tmp, { recursive: true }),
  fs.mkdir(Path.log, { recursive: true }),
  fs.mkdir(Path.bin, { recursive: true }),
])

export class Service extends Context.Service<Service, Interface>()("@opencode/Global") {}

export interface Interface {
  readonly home: string
  readonly data: string
  readonly cache: string
  readonly config: string
  readonly state: string
  readonly tmp: string
  readonly bin: string
  readonly log: string
}

export function make(input: Partial<Interface> = {}): Interface {
  return {
    home: Path.home,
    data: Path.data,
    cache: Path.cache,
    config: Flag.OPENCODE_CONFIG_DIR ?? Path.config,
    state: Path.state,
    tmp: Path.tmp,
    bin: Path.bin,
    log: Path.log,
    ...input,
  }
}

export const layer = Layer.effect(
  Service,
  Effect.sync(() => Service.of(make())),
)

export const defaultLayer = layer

export const layerWith = (input: Partial<Interface>) =>
  Layer.effect(
    Service,
    Effect.sync(() => Service.of(make(input))),
  )

export * as Global from "./global"
