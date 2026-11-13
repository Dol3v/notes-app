import { describe, expect, it } from 'vitest'
import { fromUtf8, utf8 } from '../src/lib/bytes'
import {
  CorruptDataError,
  WrongPasswordError,
  createVault,
  decryptBytes,
  encryptBytes,
  parseHeader,
  rewrapVault,
  serializeHeader,
  unlockVault,
} from '../src/lib/crypto'
import { MemoryStore } from '../src/lib/store'
import { Vault } from '../src/lib/vault'

const FAST = { m: 1024, t: 1, p: 1 }

describe('crypto', () => {
  it('round-trips with the right password and rejects a wrong one', async () => {
    const { header, dek } = await createVault('correct horse battery', FAST)
    const ct = await encryptBytes(dek, utf8('שלום עולם'), 'aad')
    const dek2 = await unlockVault(header, 'correct horse battery')
    expect(fromUtf8(await decryptBytes(dek2, ct, 'aad'))).toBe('שלום עולם')
    await expect(unlockVault(header, 'wrong password')).rejects.toBeInstanceOf(WrongPasswordError)
  })

  it('keys are non-extractable', async () => {
    const { dek } = await createVault('pw-pw-pw-pw', FAST)
    expect(dek.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', dek)).rejects.toThrow()
  })

  it('normalizes Unicode in passwords (NFC vs NFD)', async () => {
    const nfc = 'é-סיסמה'.normalize('NFC')
    const { header } = await createVault(nfc, FAST)
    await expect(unlockVault(header, nfc.normalize('NFD'))).resolves.toBeTruthy()
  })

  it('binds ciphertext to its AAD and detects tampering', async () => {
    const { dek } = await createVault('pw-pw-pw-pw', FAST)
    const ct = await encryptBytes(dek, utf8('secret'), 'note:a')
    await expect(decryptBytes(dek, ct, 'note:b')).rejects.toBeInstanceOf(CorruptDataError)
    const tampered = ct.slice()
    tampered[20] ^= 1
    await expect(decryptBytes(dek, tampered, 'note:a')).rejects.toBeInstanceOf(CorruptDataError)
  })

  it('header contains no password-derived verifier, only the wrapped key', async () => {
    const { header } = await createVault('my secret password', FAST)
    const json = fromUtf8(serializeHeader(header))
    expect(json).not.toContain('my secret password')
    expect(Object.keys(header).sort()).toEqual(['dek', 'format', 'id', 'kdf', 'v'])
    expect(parseHeader(serializeHeader(header))).toEqual(header)
  })

  it('changing the password keeps the same data key', async () => {
    const { header, dek } = await createVault('old password!', FAST)
    const ct = await encryptBytes(dek, utf8('hello'), 'x')
    const h2 = await rewrapVault(header, 'old password!', 'new password!', FAST)
    await expect(unlockVault(h2, 'old password!')).rejects.toBeInstanceOf(WrongPasswordError)
    const dek2 = await unlockVault(h2, 'new password!')
    expect(fromUtf8(await decryptBytes(dek2, ct, 'x'))).toBe('hello')
  })
})

describe('vault at rest', () => {
  it('stores nothing readable', async () => {
    const files = new MemoryStore()
    const local = new MemoryStore()
    const v = await Vault.create('vault password', files, local, FAST)
    v.settings.github = { owner: 'me', repo: 'data', branch: 'main', token: 'github_pat_SECRET' }
    await v.saveSettings()
    await v.saveNote({ ...v.newNote('# רשימת קניות\nחלב, לחם'), id: 'aaaaaaaa-0000-4000-8000-000000000000' })

    const all = [...files.data.values(), ...local.data.values()].map((b) => Buffer.from(b).toString('latin1')).join('|')
    for (const needle of ['רשימת', 'קניות', 'חלב', 'github_pat_SECRET', 'vault password']) {
      expect(all).not.toContain(Buffer.from(needle).toString('latin1'))
    }

    const reopened = await Vault.open('vault password', files, local)
    expect(reopened.notes.get('aaaaaaaa-0000-4000-8000-000000000000')!.body).toContain('חלב')
    expect(reopened.settings.github?.token).toBe('github_pat_SECRET')
    await expect(Vault.open('nope', files, local)).rejects.toBeInstanceOf(WrongPasswordError)
  })
})
