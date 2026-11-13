/**
 * Git-style three-way sync between the local encrypted files and a GitHub repo.
 *
 * For every managed path we compare three blob SHAs: local, remote, and "base" (what both
 * sides agreed on at the last successful sync). Whoever changed relative to base wins; if
 * both changed, both versions are kept. Only ciphertext ever leaves the device.
 */
import { type Bytes, gitBlobSha } from './bytes'
import { parseHeader } from './crypto'
import { type GitHubClient, type Head, type TreeEntry } from './github'
import type { ByteStore } from './store'
import { type Vault, VAULT_PATH, isManagedPath, noteIdFromPath, notePath } from './vault'

export type SyncActionKind = 'push' | 'pull' | 'deleteRemote' | 'deleteLocal' | 'conflict'
export interface SyncAction {
  path: string
  kind: SyncActionKind
}

export function planSync(
  local: Map<string, string>,
  remote: Map<string, string>,
  base: Record<string, string>,
): SyncAction[] {
  const paths = new Set([...local.keys(), ...remote.keys(), ...Object.keys(base)])
  const actions: SyncAction[] = []
  for (const path of [...paths].sort()) {
    const l = local.get(path)
    const r = remote.get(path)
    const b = base[path]
    if (l === r) continue
    let kind: SyncActionKind
    if (l === b) kind = r === undefined ? 'deleteLocal' : 'pull'
    else if (r === b) kind = l === undefined ? 'deleteRemote' : 'push'
    // both sides changed: an edit always beats a delete
    else if (l === undefined) kind = 'pull'
    else if (r === undefined) kind = 'push'
    else kind = 'conflict'
    actions.push({ path, kind })
  }
  return actions
}

export interface SyncReport {
  pulled: string[]
  pushed: number
  deletedLocal: string[]
  deletedRemote: number
  conflicts: string[]
  /** remote files we could not decrypt or that changed locally mid-sync */
  skipped: string[]
  passwordChangedRemotely: boolean
}

export class DifferentVaultError extends Error {
  constructor() {
    super('This repository contains a different vault (created with another password/device). Use an empty repo or connect this device to that vault instead.')
    this.name = 'DifferentVaultError'
  }
}

function managed(map: Map<string, string> | Map<string, Bytes>) {
  for (const k of [...map.keys()]) if (!isManagedPath(k)) map.delete(k)
  return map
}

async function shaOf(bytes: Uint8Array | undefined) {
  return bytes === undefined ? undefined : gitBlobSha(bytes)
}

export async function runSync(vault: Vault, client: GitHubClient): Promise<SyncReport> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const head = await client.getHead()
    if (!head) {
      const v = await vault.files.get(VAULT_PATH)
      if (!v) throw new Error('Local vault file missing')
      await client.initRepo(VAULT_PATH, v, 'Initialize encrypted notes vault')
      continue
    }
    const report = await syncOnce(vault, client, head)
    if (report) return report
    // another device pushed between our read and our write — go again
  }
  throw new Error('Sync kept colliding with another device. Try again in a moment.')
}

async function syncOnce(vault: Vault, client: GitHubClient, head: Head): Promise<SyncReport | null> {
  const files = vault.files
  const remote = managed(await client.getTree(head.tree)) as Map<string, string>
  const snapshot = managed(await files.list()) as Map<string, Bytes>
  const localShas = new Map<string, string>()
  for (const [p, b] of snapshot) localShas.set(p, await gitBlobSha(b))
  const base = vault.settings.base

  const report: SyncReport = {
    pulled: [],
    pushed: 0,
    deletedLocal: [],
    deletedRemote: 0,
    conflicts: [],
    skipped: [],
    passwordChangedRemotely: false,
  }

  // Never mix two different vaults in one repo.
  const remoteVaultSha = remote.get(VAULT_PATH)
  let remoteVaultBytes: Bytes | undefined
  if (remoteVaultSha && remoteVaultSha !== localShas.get(VAULT_PATH)) {
    remoteVaultBytes = await client.getBlob(remoteVaultSha)
    if (parseHeader(remoteVaultBytes).id !== vault.header.id) throw new DifferentVaultError()
  }

  const pushes = new Map<string, Bytes>()
  const remoteDeletes: string[] = []
  const keepOldBase = new Set<string>()
  /** true if the local file is still exactly what we planned against (user didn't type mid-sync) */
  const unchanged = async (path: string) => (await shaOf(await files.get(path))) === localShas.get(path)

  for (const { path, kind } of planSync(localShas, remote, base)) {
    const id = noteIdFromPath(path)

    if (kind === 'push') {
      pushes.set(path, snapshot.get(path)!)
    } else if (kind === 'deleteRemote') {
      remoteDeletes.push(path)
    } else if (kind === 'deleteLocal') {
      if (!(await unchanged(path))) {
        keepOldBase.add(path)
        continue
      }
      await files.delete(path)
      if (id) {
        vault.notes.delete(id)
        report.deletedLocal.push(id)
      }
    } else if (path === VAULT_PATH) {
      // pull or conflict on the header = the password was changed on another device.
      const bytes = remoteVaultBytes ?? (await client.getBlob(remote.get(path)!))
      await files.put(path, bytes)
      vault.header = parseHeader(bytes)
      report.passwordChangedRemotely = true
    } else if (id) {
      const remoteBytes = await client.getBlob(remote.get(path)!)
      let remoteNote
      try {
        remoteNote = await vault.decryptNote(id, remoteBytes)
      } catch {
        keepOldBase.add(path)
        report.skipped.push(path)
        continue
      }
      if (kind === 'pull') {
        if (!(await unchanged(path))) {
          keepOldBase.add(path)
          report.skipped.push(path)
          continue
        }
      } else {
        // conflict: keep the local version as a separate "conflict copy" note
        const localBytes = await files.get(path)
        const local = localBytes && (await vault.decryptNote(id, localBytes).catch(() => undefined))
        if (local) {
          const copy = { ...local, id: crypto.randomUUID(), conflict: true }
          pushes.set(notePath(copy.id), await vault.saveNote(copy))
          report.conflicts.push(copy.id)
        }
      }
      await files.put(path, remoteBytes)
      vault.notes.set(id, remoteNote)
      report.pulled.push(id)
    }
  }

  const newBase: Record<string, string> = Object.fromEntries(remote)
  if (pushes.size || remoteDeletes.length) {
    const entries: TreeEntry[] = []
    for (const [path, bytes] of pushes) {
      const sha = await client.createBlob(bytes)
      entries.push({ path, mode: '100644', type: 'blob', sha })
      newBase[path] = sha
    }
    for (const path of remoteDeletes) {
      entries.push({ path, mode: '100644', type: 'blob', sha: null })
      delete newBase[path]
    }
    const tree = await client.createTree(head.tree, entries)
    const n = pushes.size + remoteDeletes.length
    const commit = await client.createCommit(`sync: ${n} file${n === 1 ? '' : 's'}`, tree, [head.commit])
    if (!(await client.updateRef(commit))) return null
    report.pushed = pushes.size
    report.deletedRemote = remoteDeletes.length
  }
  for (const path of keepOldBase) {
    if (base[path] !== undefined) newBase[path] = base[path]
    else delete newBase[path]
  }

  vault.settings.base = newBase
  vault.settings.lastSync = Date.now()
  await vault.saveSettings()
  return report
}

/** First-time setup on a new device: copy all encrypted files from the repo. */
export async function downloadVault(client: GitHubClient, files: ByteStore): Promise<number> {
  const head = await client.getHead()
  if (!head) throw new Error('This repository is empty. Create the vault on your first device and sync it first.')
  const tree = managed(await client.getTree(head.tree)) as Map<string, string>
  if (!tree.has(VAULT_PATH)) throw new Error('No vault.json found in this repository.')
  const entries = [...tree]
  let i = 0
  const worker = async () => {
    while (i < entries.length) {
      const [path, sha] = entries[i++]
      await files.put(path, await client.getBlob(sha))
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return entries.length
}
