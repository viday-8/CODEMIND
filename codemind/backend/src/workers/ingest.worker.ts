import { Worker, Job } from 'bullmq'
import { getRedis } from '../lib/redis'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { RepositoryRepository } from '../repositories/repository.repository'
import { IngestJobRepository } from '../repositories/ingest-job.repository'
import { GitHubService } from '../lib/github'
import { ParserService } from '../lib/parser'
import { GraphService } from '../services/graph.service'
import { EmbedService } from '../services/embed.service'
import { FileRepository } from '../repositories/file.repository'
import { GraphRepository } from '../repositories/graph.repository'
import { ChunkRepository } from '../repositories/chunk.repository'
import { extractChunks } from '../services/chunk.service'
import { embedText } from '../lib/embedder'

interface IngestJobData {
  repositoryId: string
  jobId: string
}

const repoRepo   = new RepositoryRepository(prisma)
const jobRepo    = new IngestJobRepository(prisma)
const fileRepo   = new FileRepository(prisma)
const graphRepo  = new GraphRepository(prisma)
const chunkRepo  = new ChunkRepository(prisma)

async function emitProgress(job: Job, pct: number, label: string) {
  await job.updateProgress({ type: 'progress', pct, label })
}

async function emitLog(job: Job, message: string, level: 'info' | 'ok' | 'error' = 'info') {
  await job.updateProgress({ type: 'log', message, level })
}

export function startIngestWorker() {
  const worker = new Worker<IngestJobData>('ingest-queue', async (job) => {
    const { repositoryId, jobId } = job.data
    const start = Date.now()

    await jobRepo.updateStatus(jobId, 'RUNNING')
    await emitProgress(job, 0, 'Starting ingest...')

    try {
      const repo = await repoRepo.findById(repositoryId)
      if (!repo) throw new Error(`Repository ${repositoryId} not found`)

      const github = new GitHubService(repo.githubToken ?? undefined)

      // Step 1 — Resolve repo metadata [0–10]
      await emitProgress(job, 5, 'Resolving repository metadata...')
      const meta = await github.getRepoMeta(repo.owner, repo.name)
      const defaultBranch = meta.default_branch ?? repo.defaultBranch
      await emitLog(job, `  Default branch: ${defaultBranch}`, 'info')

      // Step 2 — Fetch file tree [10–20]
      await emitProgress(job, 10, 'Fetching file tree...')
      const tree = await github.getTree(repo.owner, repo.name, defaultBranch)
      await emitLog(job, `  Found ${tree.length} entries in tree`, 'info')

      // Step 3 — Filter [20–25]
      await emitProgress(job, 20, 'Filtering source files...')
      const files = GitHubService.filterTree(tree)
      await emitLog(job, `  ${files.length} source files after filtering`, 'ok')

      // Step 4 — Fetch file contents [25–60]
      await emitProgress(job, 25, 'Fetching file contents...')
      const contents = await github.fetchFileContents(
        repo.owner, repo.name, defaultBranch, files,
        async (done, total, path) => {
          const pct = 25 + Math.round((done / total) * 35)
          await emitProgress(job, pct, `Fetching ${done}/${total}...`)
          await emitLog(job, `  [raw] ${path}`, 'info')
        },
      )
      await emitLog(job, `  Fetched ${contents.length} files`, 'ok')

      // Step 5 — Parse AST [60–70]
      await emitProgress(job, 60, 'Parsing AST...')
      const parser = new ParserService()
      const parsed = await parser.parseAll(contents)
      await emitLog(job, `  Parsed ${parsed.length} files`, 'ok')

      // Step 6 — Build knowledge graph [70–80]
      await emitProgress(job, 70, 'Building knowledge graph...')
      const graphService = new GraphService(graphRepo, fileRepo)
      const { nodes, edges } = await graphService.buildGraph(repositoryId, parsed)
      await emitLog(job, `  ${nodes} nodes, ${edges} edges`, 'ok')

      // Step 7 — Generate embeddings [80–95]
      await emitProgress(job, 80, 'Generating embeddings...')
      const embedService = new EmbedService(fileRepo)
      const { embedded } = await embedService.embedAll(
        repositoryId, contents,
        async (done, total) => {
          const pct = 80 + Math.round((done / total) * 15)
          await emitProgress(job, pct, `Embedding ${done}/${total}...`)
        },
      )
      await emitLog(job, `  Generated ${embedded} embeddings`, 'ok')

      // Step 7.5 — Extract and embed code chunks [95–97]
      await emitProgress(job, 95, 'Chunking code...')
      await chunkRepo.deleteForRepo(repositoryId)
      const allFiles = await fileRepo.findByRepo(repositoryId)
      let chunksTotal = 0
      for (const file of allFiles) {
        const fileNode = await graphRepo.findFileNodeByPath(repositoryId, file.path)
        const symbolNodes = fileNode ? await graphRepo.findChildNodes(fileNode.id) : []
        const rawChunks = extractChunks(file.content, symbolNodes)
        const saved = await chunkRepo.upsertChunks(repositoryId, file.id, file.path, rawChunks)
        for (const chunk of saved) {
          const raw = rawChunks.find((c) => c.startLine === chunk.startLine)
          if (!raw) continue
          try {
            const embedding = await embedText(raw.content.slice(0, 1500))
            await chunkRepo.updateEmbedding(chunk.id, embedding)
            chunksTotal++
          } catch { /* skip */ }
        }
      }
      await emitLog(job, `  Chunks: ${chunksTotal} embedded`, 'ok')

      // Step 8 — Mark complete [97–100]
      await emitProgress(job, 97, 'Finalising...')
      await repoRepo.updateLastIngested(repositoryId)
      await jobRepo.updateStatus(jobId, 'DONE', { progress: 100 })

      const stats = { files: contents.length, nodes, edges, embeddings: embedded, chunks: chunksTotal }
      await emitProgress(job, 100, 'Done!')

      logger.info({ repositoryId, durationMs: Date.now() - start, stats }, 'Ingest completed')
      return stats

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error({ repositoryId, err }, 'Ingest failed')
      await jobRepo.updateStatus(jobId, 'FAILED', { errorMessage: message })
      await repoRepo.updateStatus(repositoryId, 'ERROR')
      throw err
    }
  }, {
    connection: getRedis() as any,
    concurrency: 2,
  })

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Ingest worker job failed')
  })

  logger.info('IngestWorker started')
  return worker
}
