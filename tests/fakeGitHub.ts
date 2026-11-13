/** In-memory imitation of the GitHub Git Data API endpoints the sync engine uses. */
import { fromBase64, gitBlobSha, randomBytes, toBase64, toHex, utf8 } from '../src/lib/bytes'
import type { FetchFn } from '../src/lib/github'

export class FakeGitHub {
  blobs = new Map<string, Uint8Array>()
  trees = new Map<string, Map<string, string>>()
  commits = new Map<string, { tree: string; parents: string[] }>()
  ref: string | null = null
  /** runs right before a ref update is applied — lets tests simulate a concurrent push */
  beforeRefUpdate?: () => Promise<void>

  get files(): Map<string, Uint8Array> {
    if (!this.ref) return new Map()
    const tree = this.trees.get(this.commits.get(this.ref)!.tree)!
    return new Map([...tree].map(([p, sha]) => [p, this.blobs.get(sha)!]))
  }

  private async putBlob(bytes: Uint8Array) {
    const sha = await gitBlobSha(bytes)
    this.blobs.set(sha, bytes)
    return sha
  }
  private async putTree(map: Map<string, string>) {
    const sha = toHex(utf8(JSON.stringify([...map].sort()))).slice(0, 40) + toHex(randomBytes(4))
    this.trees.set(sha, map)
    return sha
  }
  private putCommit(tree: string, parents: string[]) {
    const sha = toHex(randomBytes(20))
    this.commits.set(sha, { tree, parents })
    return sha
  }

  fetch: FetchFn = async (url, init) => {
    const u = new URL(url)
    const path = u.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '')
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body as string) : undefined
    const json = (status: number, obj: unknown) =>
      new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })
    let m: RegExpExecArray | null

    if (method === 'GET' && path === '') return json(200, { private: true, permissions: { push: true } })
    if (method === 'GET' && path === '/git/ref/heads/main') {
      return this.ref ? json(200, { object: { sha: this.ref } }) : json(409, { message: 'Git Repository is empty.' })
    }
    if (method === 'GET' && (m = /^\/git\/commits\/(\w+)$/.exec(path))) {
      const c = this.commits.get(m[1])
      return c ? json(200, { sha: m[1], tree: { sha: c.tree } }) : json(404, { message: 'Not Found' })
    }
    if (method === 'GET' && (m = /^\/git\/trees\/(\w+)$/.exec(path))) {
      const t = this.trees.get(m[1])!
      return json(200, { truncated: false, tree: [...t].map(([p, sha]) => ({ path: p, sha, type: 'blob', mode: '100644' })) })
    }
    if (method === 'GET' && (m = /^\/git\/blobs\/(\w+)$/.exec(path))) {
      const b = this.blobs.get(m[1])!
      return json(200, { content: toBase64(b).replace(/(.{60})/g, '$1\n'), encoding: 'base64' })
    }
    if (method === 'POST' && path === '/git/blobs') return json(201, { sha: await this.putBlob(fromBase64(body.content)) })
    if (method === 'POST' && path === '/git/trees') {
      const map = new Map(this.trees.get(body.base_tree) ?? [])
      for (const e of body.tree) {
        if (e.sha === null) map.delete(e.path)
        else map.set(e.path, e.sha)
      }
      return json(201, { sha: await this.putTree(map) })
    }
    if (method === 'POST' && path === '/git/commits') return json(201, { sha: this.putCommit(body.tree, body.parents) })
    if (method === 'PATCH' && path === '/git/refs/heads/main') {
      await this.beforeRefUpdate?.()
      const c = this.commits.get(body.sha)!
      if (c.parents[0] !== this.ref) return json(422, { message: 'Update is not a fast forward' })
      this.ref = body.sha
      return json(200, {})
    }
    if (method === 'PUT' && (m = /^\/contents\/(.+)$/.exec(path))) {
      if (this.ref) return json(422, { message: 'exists' })
      const blob = await this.putBlob(fromBase64(body.content))
      const tree = await this.putTree(new Map([[m[1], blob]]))
      this.ref = this.putCommit(tree, [])
      return json(201, {})
    }
    return json(404, { message: `fake: unhandled ${method} ${path}` })
  }
}
