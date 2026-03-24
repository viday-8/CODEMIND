import { Octokit } from '@octokit/rest'
import { logger } from './logger'

export const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.go', '.rb', '.rs', '.cpp', '.c', '.h',
  '.cs', '.swift', '.kt', '.php', '.vue', '.svelte',
])

const SKIP_DIRS = /^(node_modules|dist|build|\.git|\.next|coverage|vendor|__pycache__|\.venv)([/\\]|$)/
const MAX_FILE_SIZE = 500_000 // 500KB

export interface TreeEntry {
  path: string
  sha: string
  size?: number
}

export interface FileContent {
  path: string
  content: string
  sha: string
  sizeBytes: number
}

export class GitHubService {
  private octokit: Octokit

  constructor(token?: string) {
    this.octokit = new Octokit({ auth: token })
  }

  async getRepoMeta(owner: string, repo: string) {
    const { data } = await this.octokit.repos.get({ owner, repo })
    return data
  }

  async getTree(owner: string, repo: string, branch: string): Promise<TreeEntry[]> {
    const { data } = await this.octokit.git.getTree({
      owner, repo,
      tree_sha: branch,
      recursive: '1',
    })
    return (data.tree || [])
      .filter((t) => t.type === 'blob' && t.path && t.sha)
      .map((t) => ({ path: t.path!, sha: t.sha!, size: t.size }))
  }

  static filterTree(tree: TreeEntry[]): TreeEntry[] {
    return tree.filter((f) => {
      if (SKIP_DIRS.test(f.path)) return false
      if ((f.size ?? 0) > MAX_FILE_SIZE) return false
      const ext = '.' + f.path.split('.').pop()?.toLowerCase()
      return CODE_EXTENSIONS.has(ext)
    })
  }

  async getRawContent(owner: string, repo: string, branch: string, path: string): Promise<string> {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Raw fetch failed for ${path}: ${res.status}`)
    return res.text()
  }

  async getFileContent(owner: string, repo: string, path: string): Promise<string> {
    const { data } = await this.octokit.repos.getContent({ owner, repo, path })
    if ('content' in data && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf8')
    }
    throw new Error(`No content for ${path}`)
  }

  async fetchFileContents(
    owner: string,
    repo: string,
    branch: string,
    files: TreeEntry[],
    onProgress?: (done: number, total: number, path: string) => Promise<void>,
  ): Promise<FileContent[]> {
    const results: FileContent[] = []
    const batchSize = 10

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)
      const settled = await Promise.allSettled(
        batch.map(async (f) => {
          let content: string
          try {
            content = await this.getRawContent(owner, repo, branch, f.path)
          } catch {
            content = await this.getFileContent(owner, repo, f.path)
          }
          return {
            path: f.path,
            content,
            sha: f.sha,
            sizeBytes: Buffer.byteLength(content, 'utf8'),
          }
        }),
      )
      for (let j = 0; j < settled.length; j++) {
        const result = settled[j]
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          logger.warn({ path: batch[j].path, err: result.reason }, 'Failed to fetch file')
        }
        if (onProgress) {
          await onProgress(i + j + 1, files.length, batch[j].path)
        }
      }
    }

    return results
  }

  async getBranchSha(owner: string, repo: string, branch: string): Promise<string> {
    const { data } = await this.octokit.git.getRef({ owner, repo, ref: `heads/${branch}` })
    return data.object.sha
  }

  async createBranch(owner: string, repo: string, branch: string, fromSha: string) {
    return this.octokit.git.createRef({
      owner, repo,
      ref: `refs/heads/${branch}`,
      sha: fromSha,
    })
  }

  async getFileSha(owner: string, repo: string, path: string, branch: string): Promise<string | undefined> {
    try {
      const { data } = await this.octokit.repos.getContent({ owner, repo, path, ref: branch })
      if ('sha' in data) return data.sha
    } catch {
      return undefined
    }
  }

  async commitFile(owner: string, repo: string, opts: {
    path: string
    content: string
    message: string
    branch: string
    sha?: string
  }) {
    const b64 = Buffer.from(opts.content, 'utf8').toString('base64')
    return this.octokit.repos.createOrUpdateFileContents({
      owner, repo,
      path: opts.path,
      message: opts.message,
      content: b64,
      branch: opts.branch,
      sha: opts.sha,
    })
  }

  async createPR(owner: string, repo: string, opts: {
    title: string
    body: string
    head: string
    base: string
  }) {
    return this.octokit.pulls.create({
      owner, repo,
      title: opts.title,
      body: opts.body,
      head: opts.head,
      base: opts.base,
      maintainer_can_modify: true,
    })
  }
}
