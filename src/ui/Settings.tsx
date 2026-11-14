import { useState } from 'preact/hooks'
import { WrongPasswordError } from '../lib/crypto'
import { GitHubClient } from '../lib/github'
import { timeAgo } from '../lib/notes'
import { wipeDevice } from '../lib/store'
import type { Direction } from '../lib/vault'
import { type Session, isMobileDevice } from '../session'
import { GitHubFields, parseRepo } from './GitHubFields'
import { IconBack } from './icons'
import { MIN_PASSWORD, passwordStrength } from './password'

export function Settings({ session, onBack }: { session: Session; onBack: () => void }) {
  return (
    <div class="settings">
      <header class="bar">
        <button class="icon-btn back" onClick={onBack} aria-label="Back">
          <IconBack />
        </button>
        <div class="bar-title">
          <span class="title-text">Settings</span>
        </div>
      </header>
      <div class="settings-body">
        <SyncSection session={session} />
        <AppearanceSection session={session} />
        <SecuritySection session={session} />
        <ExportSection session={session} />
        <DangerSection />
      </div>
    </div>
  )
}

function SyncSection({ session }: { session: Session }) {
  const cfg = session.vault.settings.github
  const [form, setForm] = useState({
    repo: cfg ? `${cfg.owner}/${cfg.repo}` : '',
    branch: cfg?.branch ?? 'main',
    token: cfg?.token ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const save = async () => {
    const parsed = parseRepo(form.repo)
    if (!parsed || !form.token.trim()) return setMsg('Enter the repository (owner/name) and a token')
    const next = { ...parsed, branch: form.branch.trim() || 'main', token: form.token.trim() }
    setBusy(true)
    setMsg(null)
    try {
      await new GitHubClient(next).checkAccess()
      await session.setGitHub(next)
      await session.syncNow()
      setMsg(session.status === 'error' ? null : 'Connected and synced ✓')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!confirm('Stop syncing on this device? Notes stay here and on GitHub.')) return
    await session.setGitHub(undefined)
    setForm({ repo: '', branch: 'main', token: '' })
  }

  const last = session.vault.settings.lastSync
  return (
    <section>
      <h2>Sync (GitHub)</h2>
      <p class="subtle small">
        Only encrypted files with random names are uploaded. Syncs on unlock, ~30 s after you stop typing, when you leave
        the app, and with the sync button.
      </p>
      {cfg && (
        <p class="small">
          Status: <b>{session.status}</b>
          {last && ` · last sync ${timeAgo(last)}`}
          {session.error && <span class="error"> · {session.error}</span>}
        </p>
      )}
      <GitHubFields value={form} onChange={setForm} />
      <div class="row">
        <button class="btn primary" disabled={busy} onClick={save}>
          {busy ? 'Connecting…' : cfg ? 'Save & sync' : 'Connect'}
        </button>
        {cfg && (
          <button class="btn" disabled={busy} onClick={() => session.syncNow()}>
            Sync now
          </button>
        )}
        {cfg && (
          <button class="btn" disabled={busy} onClick={disconnect}>
            Disconnect
          </button>
        )}
      </div>
      {msg && <p class="small">{msg}</p>}
    </section>
  )
}

function AppearanceSection({ session }: { session: Session }) {
  const p = session.prefs
  const openKey = isMobileDevice() ? 'openMode' : 'desktopOpenMode'
  return (
    <section>
      <h2>Appearance</h2>
      <label class="setting">
        <span>Text direction</span>
        <select value={p.direction} onChange={(e) => session.updatePrefs({ direction: (e.target as HTMLSelectElement).value as Direction })}>
          <option value="auto">Automatic per line</option>
          <option value="rtl">Always right-to-left</option>
          <option value="ltr">Always left-to-right</option>
        </select>
      </label>
      <label class="setting">
        <span>Text size ({p.fontSize}px)</span>
        <input
          type="range"
          min={13}
          max={26}
          value={p.fontSize}
          onInput={(e) => session.updatePrefs({ fontSize: Number((e.target as HTMLInputElement).value) })}
        />
      </label>
      <label class="setting">
        <span>
          Open notes in
          <br />
          <span class="subtle small">{isMobileDevice() ? 'Setting for phones & tablets' : 'Setting for computers'}</span>
        </span>
        <select value={p[openKey]} onChange={(e) => session.updatePrefs({ [openKey]: (e.target as HTMLSelectElement).value as 'edit' | 'preview' })}>
          <option value="preview">Reading view</option>
          <option value="edit">Editor</option>
        </select>
      </label>
    </section>
  )
}

function SecuritySection({ session }: { session: Session }) {
  const p = session.prefs
  const [oldPw, setOld] = useState('')
  const [newPw, setNew] = useState('')
  const [newPw2, setNew2] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const change = async () => {
    if (newPw.length < MIN_PASSWORD) return setMsg(`Use at least ${MIN_PASSWORD} characters`)
    if (newPw !== newPw2) return setMsg('New passwords do not match')
    setBusy(true)
    setMsg(null)
    await new Promise((r) => setTimeout(r, 50))
    try {
      await session.changePassword(oldPw, newPw)
      setOld('')
      setNew('')
      setNew2('')
      setMsg('Password changed ✓ — your other devices will need the new password after their next sync.')
    } catch (e) {
      setMsg(e instanceof WrongPasswordError ? 'Current password is wrong' : String(e))
    } finally {
      setBusy(false)
    }
  }

  const strength = passwordStrength(newPw)
  const mobile = isMobileDevice()
  const bgKey = mobile ? 'backgroundLockSeconds' : 'desktopBackgroundLockSeconds'
  return (
    <section>
      <h2>Security</h2>
      <label class="setting">
        <span>Lock after inactivity</span>
        <select value={p.autoLockMinutes} onChange={(e) => session.updatePrefs({ autoLockMinutes: Number((e.target as HTMLSelectElement).value) })}>
          {[1, 2, 5, 10, 15, 30, 60].map((m) => (
            <option value={m}>{m} min</option>
          ))}
        </select>
      </label>
      <label class="setting">
        <span>
          {mobile ? 'Lock when the app is in the background' : 'Lock when this tab/window is hidden'}
          <br />
          <span class="subtle small">{mobile ? 'Setting for phones & tablets' : 'Setting for computers'}</span>
        </span>
        <select value={p[bgKey]} onChange={(e) => session.updatePrefs({ [bgKey]: Number((e.target as HTMLSelectElement).value) })}>
          <option value={0}>Immediately</option>
          <option value={30}>After 30 s</option>
          <option value={60}>After 1 min</option>
          <option value={300}>After 5 min</option>
          <option value={900}>After 15 min</option>
          <option value={-1}>Only by inactivity timer</option>
        </select>
      </label>

      <h3>Change password</h3>
      <div class="fields">
        <input class="input" type="password" placeholder="Current password" autocomplete="off" value={oldPw} onInput={(e) => setOld((e.target as HTMLInputElement).value)} />
        <input class="input" type="password" placeholder="New password" autocomplete="off" value={newPw} onInput={(e) => setNew((e.target as HTMLInputElement).value)} />
        {newPw && <div class={`strength s${strength.score}`}>{strength.label}</div>}
        <input class="input" type="password" placeholder="Repeat new password" autocomplete="off" value={newPw2} onInput={(e) => setNew2((e.target as HTMLInputElement).value)} />
      </div>
      <button class="btn" disabled={busy || !oldPw || !newPw} onClick={change}>
        {busy ? 'Changing…' : 'Change password'}
      </button>
      {msg && <p class="small">{msg}</p>}
    </section>
  )
}

function ExportSection({ session }: { session: Session }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<File | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const build = async () => {
    if (pw.length < 8) return setMsg('Use at least 8 characters for the export password')
    if (pw !== pw2) return setMsg('Passwords do not match')
    setBusy(true)
    setMsg(null)
    try {
      await session.flush()
      const { buildEncryptedExport, exportFilename } = await import('../lib/export') // zip.js loads only when needed
      const bytes = await buildEncryptedExport(session.notes, pw)
      setResult(new File([bytes], exportFilename(), { type: 'application/zip' }))
      setPw('')
      setPw2('')
    } catch (e) {
      setMsg(String(e))
    } finally {
      setBusy(false)
    }
  }

  const download = () => {
    if (!result) return
    const url = URL.createObjectURL(result)
    const a = document.createElement('a')
    a.href = url
    a.download = result.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  const canShare = !!result && !!navigator.canShare?.({ files: [result] })
  const share = () => result && navigator.share({ files: [result], title: result.name }).catch(() => {})

  return (
    <section>
      <h2>Export</h2>
      <p class="subtle small">
        Creates an AES-256 encrypted zip with its own password, built entirely in memory. Inside is <code>notes.zip</code>{' '}
        with one <code>.md</code> file per note (nested so that note titles are hidden too). Open it with 7-Zip / WinRAR
        on Windows or ZArchiver on Android.
      </p>
      {!result ? (
        <>
          <div class="fields">
            <input class="input" type="password" placeholder="Export password" autocomplete="off" value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} />
            <input class="input" type="password" placeholder="Repeat export password" autocomplete="off" value={pw2} onInput={(e) => setPw2((e.target as HTMLInputElement).value)} />
          </div>
          <button class="btn" disabled={busy || !pw} onClick={build}>
            {busy ? 'Encrypting…' : `Create encrypted export (${session.notes.length} notes)`}
          </button>
        </>
      ) : (
        <div class="row">
          <button class="btn primary" onClick={download}>
            Download {result.name}
          </button>
          {canShare && (
            <button class="btn" onClick={share}>
              Share…
            </button>
          )}
          <button class="btn" onClick={() => setResult(null)}>
            Done
          </button>
        </div>
      )}
      {msg && <p class="error small">{msg}</p>}
    </section>
  )
}

function DangerSection() {
  const wipe = async () => {
    if (!confirm('Remove the vault from THIS device? Anything not yet synced will be lost.')) return
    if (prompt('Type DELETE to confirm') !== 'DELETE') return
    await wipeDevice()
    location.reload()
  }
  return (
    <section>
      <h2>This device</h2>
      <button class="btn danger" onClick={wipe}>
        Remove vault from this device
      </button>
    </section>
  )
}
