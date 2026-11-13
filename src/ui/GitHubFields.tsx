export interface GitHubForm {
  repo: string
  branch: string
  token: string
}

export function parseRepo(s: string): { owner: string; repo: string } | null {
  const m = /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(s.trim())
  return m ? { owner: m[1], repo: m[2] } : null
}

export function GitHubFields({ value, onChange }: { value: GitHubForm; onChange: (v: GitHubForm) => void }) {
  const set = (k: keyof GitHubForm) => (e: Event) => onChange({ ...value, [k]: (e.target as HTMLInputElement).value })
  return (
    <div class="fields">
      <label>
        <span>Private repository</span>
        <input class="input" dir="ltr" placeholder="your-user/notes-data" value={value.repo} onInput={set('repo')} autocapitalize="off" spellcheck={false} />
      </label>
      <label>
        <span>Branch</span>
        <input class="input" dir="ltr" placeholder="main" value={value.branch} onInput={set('branch')} autocapitalize="off" spellcheck={false} />
      </label>
      <label>
        <span>
          Fine-grained token{' '}
          <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
            (create)
          </a>
        </span>
        <input class="input" dir="ltr" type="password" placeholder="github_pat_…" value={value.token} onInput={set('token')} autocomplete="off" />
      </label>
      <p class="subtle small">
        Token: “Only select repositories” → your data repo. Permissions → Repository → <b>Contents: Read and write</b>.
        It is stored on this device only, encrypted with your vault key.
      </p>
    </div>
  )
}
