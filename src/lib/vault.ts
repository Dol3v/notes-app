import type { Bytes } from './bytes'
import {
  type KdfOptions,
  type VaultHeader,
  CorruptDataError,
  DEFAULT_KDF,
  createVault,
  decryptJson,
  encryptJson,
  parseHeader,
  rewrapVault,
  serializeHeader,
  unlockVault,
} from './crypto'
import type { ByteStore } from './store'

export type Direction = 'auto' | 'rtl' | 'ltr'

export interface Note {
  id: string
  body: string
  created: number
  updated: number
  /** set on the local copy kept when the same note was edited on two devices */
  conflict?: boolean
}

export interface GitHubConfig {
  owner: string
  repo: string
  branch: string
  token: string
}

export interface Prefs {
  autoLockMinutes: number
  /** phones/tablets: seconds in background before locking; -1 = only by inactivity */
  backgroundLockSeconds: number
  /** computers: same, separate because switching tabs/windows is routine there */
  desktopBackgroundLockSeconds: number
  direction: Direction
  fontSize: number
  openMode: 'preview' | 'edit'
}

/** Device-local settings. Stored encrypted with the DEK; never synced. */
export interface LocalSettings {
  github?: GitHubConfig
  /** path → git blob sha at the last successful sync */
  base: Record<string, string>
  lastSync?: number
  prefs: Prefs
}

export const DEFAULT_PREFS: Prefs = {
  autoLockMinutes: 10,
  backgroundLockSeconds: 60,
  desktopBackgroundLockSeconds: -1,
  direction: 'auto',
  fontSize: 17,
  openMode: 'preview',
}

export const VAULT_PATH = 'vault.json'
const NOTE_RE = /^notes\/([0-9a-f-]{8,64})\.enc$/
export const notePath = (id: string) => `notes/${id}.enc`
export const noteIdFromPath = (path: string) => NOTE_RE.exec(path)?.[1]
export const isManagedPath = (path: string) => path === VAULT_PATH || NOTE_RE.test(path)

const SETTINGS_KEY = 'settings'

export class Vault {
  notes = new Map<string, Note>()
  /** paths of local note files that failed to decrypt */
  undecryptable: string[] = []
  settings: LocalSettings = { base: {}, prefs: { ...DEFAULT_PREFS } }

  private constructor(
    public header: VaultHeader,
    private dek: CryptoKey,
    public files: ByteStore,
    private local: ByteStore,
  ) {}

  static async create(password: string, files: ByteStore, local: ByteStore, kdf: KdfOptions = DEFAULT_KDF) {
    const { header, dek } = await createVault(password, kdf)
    await files.put(VAULT_PATH, serializeHeader(header))
    const v = new Vault(header, dek, files, local)
    await v.saveSettings()
    return v
  }

  static async exists(files: ByteStore) {
    return (await files.get(VAULT_PATH)) !== undefined
  }

  static async open(password: string, files: ByteStore, local: ByteStore) {
    const raw = await files.get(VAULT_PATH)
    if (!raw) throw new Error('No vault on this device')
    const header = parseHeader(raw)
    const dek = await unlockVault(header, password)
    const v = new Vault(header, dek, files, local)
    await v.loadAll()
    return v
  }

  private async loadAll() {
    for (const [path, bytes] of await this.files.list()) {
      const id = noteIdFromPath(path)
      if (!id) continue
      try {
        this.notes.set(id, await this.decryptNote(id, bytes))
      } catch {
        this.undecryptable.push(path)
      }
    }
    const s = await this.local.get(SETTINGS_KEY)
    if (s) {
      try {
        const loaded = await decryptJson<LocalSettings>(this.dek, s, this.aad('local'))
        this.settings = { ...loaded, prefs: { ...DEFAULT_PREFS, ...loaded.prefs } }
      } catch {
        // settings from a different vault on this device — start fresh
      }
    }
  }

  private aad(kind: string) {
    return `encrypted-notes:v1:${this.header.id}:${kind}`
  }

  async encryptNote(note: Note): Promise<Bytes> {
    return encryptJson(this.dek, note, this.aad(`note:${note.id}`))
  }

  async decryptNote(id: string, bytes: Uint8Array): Promise<Note> {
    const note = await decryptJson<Note>(this.dek, bytes, this.aad(`note:${id}`))
    if (note.id !== id || typeof note.body !== 'string') throw new CorruptDataError()
    return note
  }

  newNote(body = ''): Note {
    const now = Date.now()
    return { id: crypto.randomUUID(), body, created: now, updated: now }
  }

  /** Encrypts and persists a note; returns the ciphertext written. */
  async saveNote(note: Note): Promise<Bytes> {
    this.notes.set(note.id, note)
    const bytes = await this.encryptNote(note)
    await this.files.put(notePath(note.id), bytes)
    return bytes
  }

  async deleteNote(id: string) {
    this.notes.delete(id)
    await this.files.delete(notePath(id))
  }

  async saveSettings() {
    await this.local.put(SETTINGS_KEY, await encryptJson(this.dek, this.settings, this.aad('local')))
  }

  async changePassword(oldPassword: string, newPassword: string, kdf: KdfOptions = DEFAULT_KDF) {
    const header = await rewrapVault(this.header, oldPassword, newPassword, kdf)
    await this.files.put(VAULT_PATH, serializeHeader(header))
    this.header = header
  }
}
