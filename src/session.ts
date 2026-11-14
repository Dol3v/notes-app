import { GitHubClient } from './lib/github'
import { sortNotes } from './lib/notes'
import { type SyncReport, runSync } from './lib/sync'
import { type GitHubConfig, type Note, type Prefs, type Vault, notePath } from './lib/vault'

export type SyncStatus = 'off' | 'synced' | 'pending' | 'syncing' | 'error'

/** Phones and tablets get the stricter background-lock setting. */
export const isMobileDevice = () =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && !matchMedia('(any-pointer: fine)').matches)

const SAVE_DELAY = 700
const SYNC_DELAY = 30_000

/** Everything the UI does to an unlocked vault goes through here. */
export class Session {
  status: SyncStatus
  error?: string
  toast?: string
  private listeners = new Set<() => void>()
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private savePromises = new Set<Promise<unknown>>()
  private syncTimer?: ReturnType<typeof setTimeout>
  private syncing?: Promise<void>
  private toastTimer?: ReturnType<typeof setTimeout>
  private locking = false
  /** notes created in this session that haven't been edited yet → their starting text */
  private fresh = new Map<string, string>()

  constructor(public vault: Vault) {
    this.status = vault.settings.github ? 'synced' : 'off'
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }
  private emit() {
    for (const fn of this.listeners) fn()
  }

  get prefs(): Prefs {
    return this.vault.settings.prefs
  }
  /** Background-lock delay for this kind of device, in seconds; -1 = only the inactivity timer. */
  get backgroundLockSeconds(): number {
    return isMobileDevice() ? this.prefs.backgroundLockSeconds : this.prefs.desktopBackgroundLockSeconds
  }
  get notes(): Note[] {
    return sortNotes(this.vault.notes.values())
  }
  note(id: string | undefined) {
    return id ? this.vault.notes.get(id) : undefined
  }

  showToast(msg: string) {
    this.toast = msg
    clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      this.toast = undefined
      this.emit()
    }, 5000)
    this.emit()
  }

  // ---------- notes ----------

  createNote(body = ''): Note {
    const note = this.vault.newNote(body)
    this.vault.notes.set(note.id, note) // not written until it is edited
    this.fresh.set(note.id, body)
    this.emit()
    return note
  }

  isFresh(id: string) {
    return this.fresh.has(id)
  }

  updateBody(id: string, body: string) {
    const note = this.vault.notes.get(id)
    if (!note || note.body === body) return
    this.fresh.delete(id)
    note.body = body
    note.updated = Date.now()
    delete note.conflict
    clearTimeout(this.saveTimers.get(id))
    this.saveTimers.set(id, setTimeout(() => void this.save(id), SAVE_DELAY))
    this.emit()
  }

  private save(id: string) {
    clearTimeout(this.saveTimers.get(id))
    this.saveTimers.delete(id)
    const note = this.vault.notes.get(id)
    if (!note) return Promise.resolve()
    const p = this.vault.saveNote(note).then(
      () => this.markDirty(),
      (e) => this.showToast(`Saving failed: ${e}`),
    )
    this.savePromises.add(p)
    void p.finally(() => this.savePromises.delete(p))
    return p
  }

  /** Write every pending edit to (encrypted) storage now. */
  async flush() {
    await Promise.all([...this.saveTimers.keys()].map((id) => this.save(id)))
    await Promise.all(this.savePromises)
  }

  async deleteNote(id: string) {
    clearTimeout(this.saveTimers.get(id))
    this.saveTimers.delete(id)
    const existed = (await this.vault.files.get(notePath(id))) !== undefined
    await this.vault.deleteNote(id)
    if (existed) this.markDirty()
    this.emit()
  }

  /** Called when leaving a note: blank or untouched new notes are thrown away instead of cluttering the list. */
  async discardIfEmpty(id: string) {
    const note = this.vault.notes.get(id)
    if (!note) return
    const untouched = this.fresh.get(id) === note.body
    this.fresh.delete(id)
    if (note.body.trim() === '' || untouched) await this.deleteNote(id)
  }

  // ---------- sync ----------

  private markDirty() {
    if (!this.vault.settings.github) return
    if (this.status !== 'syncing') this.status = 'pending'
    this.scheduleSync(SYNC_DELAY)
    this.emit()
  }

  scheduleSync(delay = SYNC_DELAY) {
    if (!this.vault.settings.github) return
    clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => void this.syncNow(), delay)
  }

  syncNow(): Promise<void> {
    if (!this.vault.settings.github) return Promise.resolve()
    if (this.syncing) return this.syncing
    clearTimeout(this.syncTimer)
    this.syncing = (async () => {
      this.status = 'syncing'
      this.error = undefined
      this.emit()
      try {
        await this.flush()
        const report = await runSync(this.vault, new GitHubClient(this.vault.settings.github!))
        this.status = this.saveTimers.size ? 'pending' : 'synced'
        this.reportToast(report)
      } catch (e) {
        this.status = 'error'
        this.error = e instanceof Error ? e.message : String(e)
      } finally {
        this.syncing = undefined
        this.emit()
      }
    })()
    return this.syncing
  }

  private reportToast(r: SyncReport) {
    const parts: string[] = []
    if (r.conflicts.length) {
      parts.push(`${r.conflicts.length} note(s) were edited on both devices — kept both versions (marked “conflict copy”)`)
    }
    if (r.passwordChangedRemotely) parts.push('Your password was changed on another device — use the new one next time')
    if (r.skipped.length) parts.push(`${r.skipped.length} remote file(s) skipped; they will be retried`)
    if (parts.length) this.showToast(parts.join('. '))
  }

  async setGitHub(cfg: GitHubConfig | undefined) {
    const prev = this.vault.settings.github
    const sameRepo = prev && cfg && prev.owner === cfg.owner && prev.repo === cfg.repo && prev.branch === cfg.branch
    this.vault.settings.github = cfg
    if (!sameRepo) this.vault.settings.base = {}
    await this.vault.saveSettings()
    this.status = cfg ? 'pending' : 'off'
    this.error = undefined
    this.emit()
  }

  // ---------- settings / security ----------

  async updatePrefs(p: Partial<Prefs>) {
    this.vault.settings.prefs = { ...this.prefs, ...p }
    await this.vault.saveSettings()
    this.emit()
  }

  async changePassword(oldPw: string, newPw: string) {
    await this.flush()
    await this.vault.changePassword(oldPw, newPw)
    this.markDirty()
    this.scheduleSync(0)
  }

  /**
   * Save, try a quick final sync, then reload the page. Reloading discards the whole JS heap —
   * keys, decrypted notes, editor state — which is the only reliable "wipe" a web app has.
   */
  async lock() {
    if (this.locking) return
    this.locking = true
    try {
      await this.flush()
      if (this.status === 'pending' || this.syncing) {
        await Promise.race([this.syncNow(), new Promise((r) => setTimeout(r, 4000))])
      }
    } finally {
      location.reload()
    }
  }
}
