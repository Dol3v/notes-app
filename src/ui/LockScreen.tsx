import { useEffect, useState } from 'preact/hooks'
import { WrongPasswordError } from '../lib/crypto'
import { GitHubClient } from '../lib/github'
import { deviceFiles, deviceLocal, wipeDevice } from '../lib/store'
import { downloadVault } from '../lib/sync'
import { type GitHubConfig, Vault } from '../lib/vault'
import { GitHubFields, parseRepo } from './GitHubFields'
import { IconLock } from './icons'
import { MIN_PASSWORD, passwordStrength } from './password'

type Phase = 'loading' | 'unlock' | 'welcome' | 'create' | 'connect' | 'connect-password'

/** Let the browser paint "Unlocking…" before Argon2 hogs the main thread. */
const nextFrame = () => new Promise((r) => setTimeout(r, 50))

export function LockScreen({ onUnlocked }: { onUnlocked: (v: Vault) => void }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gh, setGh] = useState({ repo: '', branch: 'main', token: '' })
  const [ghCfg, setGhCfg] = useState<GitHubConfig | null>(null)

  useEffect(() => {
    Vault.exists(deviceFiles()).then((e) => setPhase(e ? 'unlock' : 'welcome'))
  }, [])

  const go = (p: Phase) => {
    setError(null)
    setPw('')
    setPw2('')
    setPhase(p)
  }

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    await nextFrame()
    try {
      await fn()
    } catch (e) {
      setError(e instanceof WrongPasswordError ? 'Wrong password' : e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const unlock = () =>
    run('Unlocking…', async () => {
      const v = await Vault.open(pw, deviceFiles(), deviceLocal())
      if (ghCfg) {
        v.settings.github = ghCfg
        await v.saveSettings()
      }
      setPw('')
      onUnlocked(v)
    })

  const create = () => {
    if (pw.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters`)
    if (pw !== pw2) return setError('Passwords do not match')
    void run('Creating vault…', async () => {
      void navigator.storage?.persist?.()
      const v = await Vault.create(pw, deviceFiles(), deviceLocal())
      setPw('')
      setPw2('')
      onUnlocked(v)
    })
  }

  const connect = () => {
    const parsed = parseRepo(gh.repo)
    if (!parsed || !gh.token.trim()) return setError('Enter the repository (owner/name) and a token')
    const cfg: GitHubConfig = { ...parsed, branch: gh.branch.trim() || 'main', token: gh.token.trim() }
    void run('Downloading encrypted vault…', async () => {
      const client = new GitHubClient(cfg)
      await client.checkAccess()
      await wipeDevice()
      void navigator.storage?.persist?.()
      await downloadVault(client, deviceFiles())
      setGhCfg(cfg) // kept in memory until unlock, then stored encrypted
      go('connect-password')
    })
  }

  const reset = async () => {
    if (!confirm('Remove the vault from THIS device? Anything not yet synced will be lost. The copy on GitHub is not touched.')) return
    if (prompt('Type DELETE to confirm') !== 'DELETE') return
    await wipeDevice()
    location.reload()
  }

  const onEnter = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !busy) fn()
  }
  const strength = passwordStrength(pw)

  return (
    <div class="lock-screen">
      <div class="lock-card">
        <div class="lock-icon">
          <IconLock />
        </div>
        <h1>Notes</h1>

        {phase === 'loading' && <p class="subtle">Loading…</p>}

        {(phase === 'unlock' || phase === 'connect-password') && (
          <>
            {phase === 'connect-password' && <p class="subtle">Vault downloaded. Enter its password.</p>}
            <input
              type="password"
              class="input"
              placeholder="Password"
              autocomplete="off"
              autoFocus
              value={pw}
              onInput={(e) => setPw((e.target as HTMLInputElement).value)}
              onKeyDown={onEnter(unlock)}
            />
            <button class="btn primary" disabled={!!busy || !pw} onClick={unlock}>
              {busy ?? 'Unlock'}
            </button>
            {phase === 'unlock' && (
              <button class="link-btn small" onClick={reset}>
                Forgot password / use a different vault…
              </button>
            )}
          </>
        )}

        {phase === 'welcome' && (
          <>
            <p class="subtle">End-to-end encrypted markdown notes. Nothing readable is stored on this device or in the cloud.</p>
            <button class="btn primary" onClick={() => go('create')}>
              Create a new vault
            </button>
            <button class="btn" onClick={() => go('connect')}>
              Connect to my existing vault (GitHub)
            </button>
          </>
        )}

        {phase === 'create' && (
          <>
            <p class="warn small">
              There is <b>no password recovery</b>. If you forget it, your notes are gone. A long passphrase (e.g. 4–5
              random words) is best.
            </p>
            <input
              type="password"
              class="input"
              placeholder="New password"
              autocomplete="off"
              autoFocus
              value={pw}
              onInput={(e) => setPw((e.target as HTMLInputElement).value)}
            />
            {pw && <div class={`strength s${strength.score}`}>{strength.label}</div>}
            <input
              type="password"
              class="input"
              placeholder="Repeat password"
              autocomplete="off"
              value={pw2}
              onInput={(e) => setPw2((e.target as HTMLInputElement).value)}
              onKeyDown={onEnter(create)}
            />
            <button class="btn primary" disabled={!!busy} onClick={create}>
              {busy ?? 'Create vault'}
            </button>
            <button class="link-btn" onClick={() => go('welcome')}>
              Back
            </button>
          </>
        )}

        {phase === 'connect' && (
          <>
            <p class="subtle small">Downloads the encrypted files from your private repo. You will then enter the vault password.</p>
            <GitHubFields value={gh} onChange={setGh} />
            <button class="btn primary" disabled={!!busy} onClick={connect}>
              {busy ?? 'Download vault'}
            </button>
            <button class="link-btn" onClick={() => go('welcome')}>
              Back
            </button>
          </>
        )}

        {error && <p class="error">{error}</p>}
      </div>
    </div>
  )
}
