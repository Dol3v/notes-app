import type { Bytes } from './bytes'

/** A flat key → bytes store. Everything written through it is already ciphertext. */
export interface ByteStore {
  list(): Promise<Map<string, Bytes>>
  get(key: string): Promise<Bytes | undefined>
  put(key: string, value: Bytes): Promise<void>
  delete(key: string): Promise<void>
}

export class MemoryStore implements ByteStore {
  data = new Map<string, Bytes>()
  async list() {
    return new Map(this.data)
  }
  async get(key: string) {
    return this.data.get(key)
  }
  async put(key: string, value: Bytes) {
    this.data.set(key, value)
  }
  async delete(key: string) {
    this.data.delete(key)
  }
}

const DB_NAME = 'encrypted-notes'
type StoreName = 'files' | 'local'

let dbPromise: Promise<IDBDatabase> | undefined

function openDb(): Promise<IDBDatabase> {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('files')
      req.result.createObjectStore('local')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class IdbStore implements ByteStore {
  constructor(private name: StoreName) {}

  private async store(mode: IDBTransactionMode) {
    return (await openDb()).transaction(this.name, mode).objectStore(this.name)
  }

  async list() {
    const s = await this.store('readonly')
    const [keys, values] = await Promise.all([promisify(s.getAllKeys()), promisify(s.getAll())])
    const out = new Map<string, Bytes>()
    keys.forEach((k, i) => out.set(String(k), values[i] as Bytes))
    return out
  }
  async get(key: string) {
    return (await promisify((await this.store('readonly')).get(key))) as Bytes | undefined
  }
  async put(key: string, value: Bytes) {
    await promisify((await this.store('readwrite')).put(value, key))
  }
  async delete(key: string) {
    await promisify((await this.store('readwrite')).delete(key))
  }
}

export const deviceFiles = () => new IdbStore('files')
export const deviceLocal = () => new IdbStore('local')

/** Deletes every byte this app stored on this device. */
export async function wipeDevice(): Promise<void> {
  if (dbPromise) (await dbPromise).close()
  dbPromise = undefined
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
}
