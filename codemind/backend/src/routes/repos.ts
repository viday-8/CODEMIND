import { Router } from 'express'
import { validate } from '../middleware/validate'
import { NotFoundError, ValidationError } from '../middleware/error'
import { IngestService } from '../services/ingest.service'
import { RepositoryRepository } from '../repositories/repository.repository'
import { IngestJobRepository } from '../repositories/ingest-job.repository'
import { FileRepository } from '../repositories/file.repository'
import { embedText } from '../lib/embedder'
import { prisma } from '../lib/prisma'
import { ConnectRepoSchema, RepoPreviewQuerySchema } from '@codemind/shared'
import { GitHubService } from '../lib/github'

const router = Router()
const repoRepo  = new RepositoryRepository(prisma)
const jobRepo   = new IngestJobRepository(prisma)
const fileRepo  = new FileRepository(prisma)
const ingestService = new IngestService(repoRepo, jobRepo)

router.get('/repos', async (_req, res, next) => {
  const start = Date.now()
  try {
    const repos = await repoRepo.findAll()
    res.json({ data: repos, error: null, meta: { took: Date.now() - start } })
  } catch (err) { next(err) }
})

router.post('/repos', validate(ConnectRepoSchema), async (req, res, next) => {
  const start = Date.now()
  try {
    const { url, token, branch } = req.body
    const repo = await ingestService.connectRepository(url, token, branch)
    res.status(201).json({ data: repo, error: null, meta: { took: Date.now() - start } })
  } catch (err) { next(err) }
})

router.get('/repos/preview', async (req, res, next) => {
  const start = Date.now()
  try {
    const parsed = RepoPreviewQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')
      return next(new ValidationError(message))
    }
    const { url, token } = parsed.data

    const urlObj = new URL(url)
    const parts = urlObj.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/')
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      return next(new ValidationError('Invalid GitHub URL'))
    }
    const [owner, name] = parts

    const github = new GitHubService(token)

    let meta: Awaited<ReturnType<typeof github.getRepoMeta>>
    try {
      meta = await github.getRepoMeta(owner, name)
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) return next(new ValidationError('GitHub token is invalid or lacks repo access'))
      if (err.status === 404) return next(new ValidationError(`Repository ${owner}/${name} not found or is private`))
      if (err.status === 429) return next(new ValidationError('GitHub API rate limit exceeded. Provide a token to increase the limit.'))
      throw err
    }

    let tree: Awaited<ReturnType<typeof github.getTree>>
    try {
      tree = await github.getTree(owner, name, meta.default_branch)
    } catch (err: any) {
      if (err.status === 409) { tree = [] } else { throw err }
    }

    const filtered = GitHubService.filterTree(tree)

    const extCounts = new Map<string, number>()
    for (const f of filtered) {
      const ext = '.' + (f.path.split('.').pop()?.toLowerCase() ?? '')
      extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1)
    }
    const fileTypes = Array.from(extCounts.entries())
      .map(([ext, count]) => ({ ext, count }))
      .sort((a, b) => b.count - a.count)

    const total = filtered.length
    const scope = total === 0 ? 'No source files found'
      : total < 50  ? 'Small repo'
      : total < 200 ? 'Medium repo'
      : total < 500 ? 'Large repo'
      : 'Very large repo'
    const scopeMessage = `${scope} · ${total} source file${total !== 1 ? 's' : ''}`

    res.json({
      data: {
        name: meta.name,
        fullName: meta.full_name,
        description: meta.description ?? null,
        language: meta.language ?? null,
        stars: meta.stargazers_count,
        defaultBranch: meta.default_branch,
        totalFiles: total,
        fileTypes,
        scopeMessage,
      },
      error: null,
      meta: { took: Date.now() - start },
    })
  } catch (err) { next(err) }
})

router.get('/repos/:id', async (req, res, next) => {
  const start = Date.now()
  try {
    const repo = await repoRepo.findById(req.params.id)
    if (!repo) throw new NotFoundError('Repository not found')
    const stats = await repoRepo.getStats(req.params.id)
    res.json({ data: { ...repo, stats }, error: null, meta: { took: Date.now() - start } })
  } catch (err) { next(err) }
})

router.delete('/repos/:id', async (req, res, next) => {
  const start = Date.now()
  try {
    const repo = await repoRepo.findById(req.params.id)
    if (!repo) throw new NotFoundError('Repository not found')
    await repoRepo.delete(req.params.id)
    res.status(204).end()
  } catch (err) { next(err) }
})

router.post('/repos/:id/ingest', async (req, res, next) => {
  const start = Date.now()
  try {
    const job = await ingestService.queueIngest(req.params.id)
    res.status(202).json({ data: { jobId: job.id }, error: null, meta: { took: Date.now() - start } })
  } catch (err) { next(err) }
})

// Vector search
router.get('/repos/:id/search', async (req, res, next) => {
  const start = Date.now()
  try {
    const repo = await repoRepo.findById(req.params.id)
    if (!repo) throw new NotFoundError('Repository not found')
    const q = String(req.query.q ?? '')
    if (!q) { res.json({ data: [], error: null, meta: { took: 0 } }); return }
    const limit = Math.min(Number(req.query.limit) || 6, 20)
    const embedding = await embedText(q)
    const results   = await fileRepo.findSimilar(req.params.id, embedding, limit)
    res.json({ data: results, error: null, meta: { took: Date.now() - start } })
  } catch (err) { next(err) }
})

// Graph — implemented in P2-01
router.get('/repos/:id/graph', async (req, res, next) => {
  const start = Date.now()
  try {
    const limit = Math.min(Number(req.query.limit) || 500, 1000)
    const nodes = await prisma.graphNode.findMany({
      where: { repositoryId: req.params.id },
      take: limit,
    })
    const edges = await prisma.graphEdge.findMany({
      where: { from: { repositoryId: req.params.id } },
      take: limit,
    })
    res.json({ data: { nodes, edges }, error: null, meta: { took: Date.now() - start } })
  } catch (err) { next(err) }
})

export default router
