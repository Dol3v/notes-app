import { type Bytes, fromBase64, toBase64 } from './bytes'
import type { GitHubConfig } from './vault'

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'GitHubError'
  }
}

export interface Head {
  commit: string
  tree: string
}

export interface TreeEntry {
  path: string
  mode: '100644'
  type: 'blob'
  sha: string | null
}

/** Minimal GitHub REST client: only the Git Data API calls the sync engine needs. */
export class GitHubClient {
  constructor(
    private cfg: GitHubConfig,
    private fetchImpl: FetchFn = (url, init) => fetch(url, init),
  ) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { owner, repo, token } = this.cfg
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`
    let res: Response
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store', // GitHub sends max-age=60; stale refs would break sync
      })
    } catch {
      throw new GitHubError('Network error — are you offline?', 0)
    }
    if (!res.ok) {
      let msg = res.statusText
      try {
        msg = (await res.json()).message ?? msg
      } catch {
        /* ignore */
      }
      if (res.status === 401) msg = 'GitHub rejected the token (expired or wrong?)'
      if (res.status === 404 && path === '') msg = 'Repository not found, or the token has no access to it'
      throw new GitHubError(msg, res.status)
    }
    return (res.status === 204 ? undefined : await res.json()) as T
  }

  async checkAccess(): Promise<void> {
    const repo = await this.req<{ private: boolean; permissions?: { push?: boolean } }>('GET', '')
    if (repo.permissions && !repo.permissions.push) throw new GitHubError('The token cannot write to this repository', 403)
  }

  /** Returns null for an empty repository (no commits yet). */
  async getHead(): Promise<Head | null> {
    let ref: { object: { sha: string } }
    try {
      ref = await this.req('GET', `/git/ref/heads/${encodeURIComponent(this.cfg.branch)}`)
    } catch (e) {
      if (e instanceof GitHubError && e.status === 409) return null
      if (e instanceof GitHubError && e.status === 404) {
        throw new GitHubError(`Branch "${this.cfg.branch}" not found in the repository`, 404)
      }
      throw e
    }
    const commit = await this.req<{ tree: { sha: string } }>('GET', `/git/commits/${ref.object.sha}`)
    return { commit: ref.object.sha, tree: commit.tree.sha }
  }

  async getTree(treeSha: string): Promise<Map<string, string>> {
    const t = await this.req<{ tree: { path: string; type: string; sha: string }[]; truncated: boolean }>(
      'GET',
      `/git/trees/${treeSha}?recursive=1`,
    )
    if (t.truncated) throw new GitHubError('Repository tree too large', 0)
    return new Map(t.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]))
  }

  async getBlob(sha: string): Promise<Bytes> {
    const b = await this.req<{ content: string; encoding: string }>('GET', `/git/blobs/${sha}`)
    if (b.encoding !== 'base64') throw new GitHubError(`Unexpected blob encoding ${b.encoding}`, 0)
    return fromBase64(b.content)
  }

  async createBlob(bytes: Uint8Array): Promise<string> {
    return (await this.req<{ sha: string }>('POST', '/git/blobs', { content: toBase64(bytes), encoding: 'base64' })).sha
  }

  async createTree(baseTree: string, entries: TreeEntry[]): Promise<string> {
    return (await this.req<{ sha: string }>('POST', '/git/trees', { base_tree: baseTree, tree: entries })).sha
  }

  async createCommit(message: string, tree: string, parents: string[]): Promise<string> {
    return (await this.req<{ sha: string }>('POST', '/git/commits', { message, tree, parents })).sha
  }

  /** Fast-forward only. Returns false if someone else pushed in the meantime. */
  async updateRef(commit: string): Promise<boolean> {
    try {
      await this.req('PATCH', `/git/refs/heads/${encodeURIComponent(this.cfg.branch)}`, { sha: commit, force: false })
      return true
    } catch (e) {
      if (e instanceof GitHubError && e.status === 422) return false
      throw e
    }
  }

  /** The Git Data API refuses to work on an empty repo; the Contents API can create the first commit. */
  async initRepo(path: string, bytes: Uint8Array, message: string): Promise<void> {
    await this.req('PUT', `/contents/${path}`, { message, content: toBase64(bytes), branch: this.cfg.branch })
  }
}
