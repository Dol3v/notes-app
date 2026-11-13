/**
 * Key hierarchy
 *
 *   password ──Argon2id(salt)──► KEK   (memory only, never stored)
 *   KEK ──AES-GCM unwrap──► DEK        (random 256-bit key, non-extractable, memory only)
 *   DEK ──AES-256-GCM──► every note and local setting
 *
 * The only thing persisted is the vault header: KDF parameters, a random salt and the
 * DEK *encrypted* under the KEK. There is no password hash or verifier — a wrong password
 * is detected only because AES-GCM authentication fails while unwrapping the DEK.
 */
import { argon2id } from 'hash-wasm'
import { type Bytes, concat, fromBase64, fromUtf8, randomBytes, toBase64, toHex, utf8 } from './bytes'

export interface KdfOptions {
  /** memory in KiB */
  m: number
  /** iterations */
  t: number
  /** parallelism */
  p: number
}

export interface KdfParams extends KdfOptions {
  alg: 'argon2id'
  salt: string
}

export interface VaultHeader {
  format: 'encrypted-notes'
  v: 1
  /** random vault identifier (not secret) used to bind ciphertexts to this vault */
  id: string
  kdf: KdfParams
  /** the data key, wrapped with the password-derived key */
  dek: { iv: string; ct: string }
}

/** 64 MiB / 3 passes: ~0.5–1.5 s on a phone, expensive for an attacker. */
export const DEFAULT_KDF: KdfOptions = { m: 65536, t: 3, p: 1 }

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong password')
    this.name = 'WrongPasswordError'
  }
}

export class CorruptDataError extends Error {
  constructor(msg = 'Data could not be decrypted') {
    super(msg)
    this.name = 'CorruptDataError'
  }
}

async function deriveKek(password: string, kdf: KdfParams): Promise<CryptoKey> {
  // NFC so the same Hebrew password typed on different keyboards yields the same bytes.
  const raw = (await argon2id({
    password: password.normalize('NFC'),
    salt: fromBase64(kdf.salt),
    parallelism: kdf.p,
    iterations: kdf.t,
    memorySize: kdf.m,
    hashLength: 32,
    outputType: 'binary',
  })) as Bytes
  try {
    return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['wrapKey', 'unwrapKey'])
  } finally {
    raw.fill(0)
  }
}

function dekAad(vaultId: string): Bytes {
  return utf8(`encrypted-notes:v1:${vaultId}:dek`)
}

async function wrapDek(dek: CryptoKey, kek: CryptoKey, vaultId: string) {
  const iv = randomBytes(12)
  const ct = new Uint8Array(
    await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv, additionalData: dekAad(vaultId) }),
  )
  return { iv: toBase64(iv), ct: toBase64(ct) }
}

async function unwrapDek(header: VaultHeader, kek: CryptoKey, extractable: boolean): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      fromBase64(header.dek.ct),
      kek,
      { name: 'AES-GCM', iv: fromBase64(header.dek.iv), additionalData: dekAad(header.id) },
      { name: 'AES-GCM', length: 256 },
      extractable,
      ['encrypt', 'decrypt'],
    )
  } catch {
    throw new WrongPasswordError()
  }
}

function newKdf(opts: KdfOptions): KdfParams {
  return { alg: 'argon2id', salt: toBase64(randomBytes(16)), m: opts.m, t: opts.t, p: opts.p }
}

export async function createVault(
  password: string,
  kdfOpts: KdfOptions = DEFAULT_KDF,
): Promise<{ header: VaultHeader; dek: CryptoKey }> {
  const id = toHex(randomBytes(16))
  const kdf = newKdf(kdfOpts)
  const kek = await deriveKek(password, kdf)
  // Extractable only for the instant it takes to wrap it; the session uses a non-extractable copy.
  const tmp = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const header: VaultHeader = { format: 'encrypted-notes', v: 1, id, kdf, dek: await wrapDek(tmp, kek, id) }
  const dek = await unwrapDek(header, kek, false)
  return { header, dek }
}

export async function unlockVault(header: VaultHeader, password: string): Promise<CryptoKey> {
  const kek = await deriveKek(password, header.kdf)
  return unwrapDek(header, kek, false)
}

/** Re-wraps the same DEK under a new password. Notes do not need re-encrypting. */
export async function rewrapVault(
  header: VaultHeader,
  oldPassword: string,
  newPassword: string,
  kdfOpts: KdfOptions = DEFAULT_KDF,
): Promise<VaultHeader> {
  const dek = await unwrapDek(header, await deriveKek(oldPassword, header.kdf), true)
  const kdf = newKdf(kdfOpts)
  const kek = await deriveKek(newPassword, kdf)
  return { ...header, kdf, dek: await wrapDek(dek, kek, header.id) }
}

export function parseHeader(bytes: Uint8Array): VaultHeader {
  let h: VaultHeader
  try {
    h = JSON.parse(fromUtf8(bytes))
  } catch {
    throw new CorruptDataError('vault.json is not valid JSON')
  }
  const k = h?.kdf
  if (
    h?.format !== 'encrypted-notes' ||
    h.v !== 1 ||
    typeof h.id !== 'string' ||
    k?.alg !== 'argon2id' ||
    typeof k.salt !== 'string' ||
    !Number.isInteger(k.m) ||
    !Number.isInteger(k.t) ||
    !Number.isInteger(k.p) ||
    typeof h.dek?.iv !== 'string' ||
    typeof h.dek?.ct !== 'string'
  ) {
    throw new CorruptDataError('vault.json has an unknown format')
  }
  return h
}

export function serializeHeader(h: VaultHeader): Bytes {
  return utf8(JSON.stringify(h, null, 2) + '\n')
}

const BLOB_VERSION = 1

/** Output: [version byte][12-byte IV][AES-GCM ciphertext+tag] */
export async function encryptBytes(key: CryptoKey, plaintext: Bytes, aad: string): Promise<Bytes> {
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(aad) }, key, plaintext)
  return concat(Uint8Array.of(BLOB_VERSION), iv, new Uint8Array(ct))
}

export async function decryptBytes(key: CryptoKey, blob: Uint8Array, aad: string): Promise<Bytes> {
  if (blob.length < 1 + 12 + 16 || blob[0] !== BLOB_VERSION) throw new CorruptDataError()
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: blob.slice(1, 13), additionalData: utf8(aad) },
      key,
      blob.slice(13),
    )
    return new Uint8Array(pt)
  } catch {
    throw new CorruptDataError()
  }
}

export async function encryptJson(key: CryptoKey, value: unknown, aad: string): Promise<Bytes> {
  return encryptBytes(key, utf8(JSON.stringify(value)), aad)
}

export async function decryptJson<T>(key: CryptoKey, blob: Uint8Array, aad: string): Promise<T> {
  return JSON.parse(fromUtf8(await decryptBytes(key, blob, aad))) as T
}
