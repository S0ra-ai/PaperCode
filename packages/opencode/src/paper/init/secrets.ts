import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "crypto"
import { readFile } from "fs/promises"
import { INIT_SECRETS_VERSION, type InitPaths, ensureInitRoot } from "./config"
import { writeJsonAtomic } from "../research/runtime/state"

const ITERATIONS = 210_000
const KEY_BYTES = 32
const IV_BYTES = 12
const SALT_BYTES = 16

export type SecretsEnvelope = {
  schema_version: typeof INIT_SECRETS_VERSION
  algorithm: "aes-256-gcm"
  kdf: "pbkdf2-sha256"
  iterations: number
  salt: string
  iv: string
  tag: string
  ciphertext: string
}

function key(passphrase: string, salt: Buffer, iterations: number) {
  if (!passphrase) throw new Error("A passphrase is required for secrets.enc.")
  return pbkdf2Sync(passphrase, salt, iterations, KEY_BYTES, "sha256")
}

export function encryptSecrets(secrets: Record<string, string>, passphrase: string): SecretsEnvelope {
  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv("aes-256-gcm", key(passphrase, salt, ITERATIONS), iv)
  const plaintext = Buffer.from(JSON.stringify(secrets), "utf8")
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return {
    schema_version: INIT_SECRETS_VERSION,
    algorithm: "aes-256-gcm",
    kdf: "pbkdf2-sha256",
    iterations: ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  }
}

export function decryptSecrets(envelope: SecretsEnvelope, passphrase: string): Record<string, string> {
  const salt = Buffer.from(envelope.salt, "base64")
  const iv = Buffer.from(envelope.iv, "base64")
  const decipher = createDecipheriv("aes-256-gcm", key(passphrase, salt, envelope.iterations), iv)
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8")
  return JSON.parse(plaintext) as Record<string, string>
}

export async function writeSecrets(paths: InitPaths, secrets: Record<string, string>, passphrase: string) {
  await ensureInitRoot(paths)
  const envelope = encryptSecrets(secrets, passphrase)
  await writeJsonAtomic(paths.secrets, envelope)
  return envelope
}

export async function readSecrets(paths: InitPaths, passphrase: string) {
  const envelope = JSON.parse(await readFile(paths.secrets, "utf8")) as SecretsEnvelope
  return decryptSecrets(envelope, passphrase)
}
