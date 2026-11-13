import { describe, expect, it } from 'vitest'
import { GitHubClient } from '../src/lib/github'
import { MemoryStore } from '../src/lib/store'
import { DifferentVaultError, downloadVault, planSync, runSync } from '../src/lib/sync'
import { type Note, Vault, notePath } from '../src/lib/vault'
import { FakeGitHub } from './fakeGitHub'

const FAST = { m: 1024, t: 1, p: 1 }
const PW = 'shared password'
const cfg = { owner: 'me', repo: 'notes-data', branch: 'main', token: 't' }

async function setup() {
  const gh = new FakeGitHub()
  const client = new GitHubClient(cfg, gh.fetch)
  const a = await Vault.create(PW, new MemoryStore(), new MemoryStore(), FAST)
  await a.saveNote(a.newNote('# הערה ראשונה\nשלום'))
  await runSync(a, client)

  const bFiles = new MemoryStore()
  await downloadVault(client, bFiles)
  const b = await Vault.open(PW, bFiles, new MemoryStore())
  await runSync(b, client)
  return { gh, client, a, b }
}

const bodies = (v: Vault) => [...v.notes.values()].map((n) => n.body).sort()
const edit = async (v: Vault, n: Note, body: string) => v.saveNote({ ...n, body, updated: Date.now() })

describe('planSync', () => {
  const m = (o: Record<string, string>) => new Map(Object.entries(o))
  it('covers the three-way cases', () => {
    const plan = planSync(
      m({ same: '1', localNew: 'n', localEdit: 'L', remoteEdit: 'b', both: 'L', remoteDel: 'b', delVsEdit: 'L' }),
      m({ same: '1', remoteNew: 'r', localEdit: 'b', remoteEdit: 'R', both: 'R', localDel: 'b', delVsEdit2: 'R' }),
      { localEdit: 'b', remoteEdit: 'b', both: 'b', remoteDel: 'b', localDel: 'b', delVsEdit: 'b', delVsEdit2: 'b' },
    )
    expect(Object.fromEntries(plan.map((a) => [a.path, a.kind]))).toEqual({
      localNew: 'push',
      remoteNew: 'pull',
      localEdit: 'push',
      remoteEdit: 'pull',
      both: 'conflict',
      remoteDel: 'deleteLocal',
      localDel: 'deleteRemote',
      delVsEdit: 'push', // deleted remotely, edited locally → edit wins
      delVsEdit2: 'pull', // deleted locally, edited remotely → edit wins
    })
  })
})

describe('sync between two devices', () => {
  it('initializes an empty repo and clones it on a second device', async () => {
    const { gh, a, b } = await setup()
    expect(bodies(b)).toEqual(bodies(a))
    expect([...gh.files.keys()].every((p) => p === 'vault.json' || /^notes\/[0-9a-f-]+\.enc$/.test(p))).toBe(true)
    // nothing readable in the repo
    const remote = [...gh.files.values()].map((x) => Buffer.from(x).toString('latin1')).join()
    expect(remote).not.toContain(Buffer.from('שלום').toString('latin1'))
  })

  it('propagates creates, edits and deletes both ways', async () => {
    const { client, a, b } = await setup()
    const n = await b.saveNote(b.newNote('from phone')).then(() => [...b.notes.values()].find((x) => x.body === 'from phone')!)
    await runSync(b, client)
    let r = await runSync(a, client)
    expect(r.pulled).toContain(n.id)
    expect(a.notes.get(n.id)!.body).toBe('from phone')

    await edit(a, a.notes.get(n.id)!, 'edited on pc')
    await runSync(a, client)
    await runSync(b, client)
    expect(b.notes.get(n.id)!.body).toBe('edited on pc')

    await b.deleteNote(n.id)
    await runSync(b, client)
    r = await runSync(a, client)
    expect(r.deletedLocal).toEqual([n.id])
    expect(a.notes.has(n.id)).toBe(false)
  })

  it('keeps both versions on a conflicting edit', async () => {
    const { client, a, b } = await setup()
    const id = [...a.notes.keys()][0]
    await edit(a, a.notes.get(id)!, 'PC version')
    await edit(b, b.notes.get(id)!, 'Phone version')
    await runSync(a, client)
    const r = await runSync(b, client)
    expect(r.conflicts).toHaveLength(1)
    expect(b.notes.get(id)!.body).toBe('PC version')
    expect(b.notes.get(r.conflicts[0])!.body).toBe('Phone version')
    expect(b.notes.get(r.conflicts[0])!.conflict).toBe(true)
    await runSync(a, client)
    expect(bodies(a)).toEqual(['PC version', 'Phone version'])
  })

  it('does not overwrite an edit made while the sync was running', async () => {
    const { gh, client, a, b } = await setup()
    const id = [...a.notes.keys()][0]
    await edit(a, a.notes.get(id)!, 'remote change')
    await runSync(a, client)
    // B starts syncing; the user types into the same note mid-sync (before B writes the pull)
    const origGet = b.files.get.bind(b.files)
    let typed = false
    b.files.get = async (k) => {
      if (!typed && k === notePath(id)) {
        typed = true
        await edit(b, b.notes.get(id)!, 'typed during sync')
      }
      return origGet(k)
    }
    const r = await runSync(b, client)
    expect(r.skipped).toContain(notePath(id))
    b.files.get = origGet
    // next sync sees a real conflict and keeps both
    const r2 = await runSync(b, client)
    expect(r2.conflicts).toHaveLength(1)
    expect(bodies(b)).toEqual(['remote change', 'typed during sync'])
    void gh
  })

  it('retries when another device pushes at the same moment', async () => {
    const { gh, client, a, b } = await setup()
    await a.saveNote(a.newNote('A note'))
    await b.saveNote(b.newNote('B note'))
    let once = false
    gh.beforeRefUpdate = async () => {
      if (once) return
      once = true
      gh.beforeRefUpdate = undefined
      await runSync(b, client) // B sneaks in between A's commit and ref update
    }
    await runSync(a, client)
    await runSync(b, client)
    expect(bodies(a)).toEqual(bodies(b))
    expect(bodies(a)).toContain('A note')
    expect(bodies(a)).toContain('B note')
  })

  it('propagates a password change', async () => {
    const { client, a, b } = await setup()
    await a.changePassword(PW, 'brand new password', FAST)
    await runSync(a, client)
    const r = await runSync(b, client)
    expect(r.passwordChangedRemotely).toBe(true)
    await expect(Vault.open(PW, b.files, new MemoryStore())).rejects.toThrow('Wrong password')
    const reopened = await Vault.open('brand new password', b.files, new MemoryStore())
    expect(bodies(reopened)).toEqual(bodies(a))
  })

  it('refuses to mix a different vault into the repo', async () => {
    const { client } = await setup()
    const other = await Vault.create(PW, new MemoryStore(), new MemoryStore(), FAST)
    await expect(runSync(other, client)).rejects.toBeInstanceOf(DifferentVaultError)
  })
})
