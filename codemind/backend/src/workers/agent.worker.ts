import { Worker, Job } from 'bullmq'
import { getRedis } from '../lib/redis'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { TaskRepository } from '../repositories/task.repository'
import { FileRepository } from '../repositories/file.repository'
import { GraphRepository } from '../repositories/graph.repository'
import { RepositoryRepository } from '../repositories/repository.repository'
import { GitHubService } from '../lib/github'
import { embedText } from '../lib/embedder'
import { callClaude } from '../lib/claude'
import { buildCodingPrompt, CODING_AGENT_SYSTEM } from '../lib/prompts'
import { parseDiff, applyDiff } from '../lib/diff'
import { reviewQueue, JOB } from '../lib/queues'

interface AgentJobData {
  taskId: string
  agentJobId: string
  rejectionReason?: string
}

const taskRepo  = new TaskRepository(prisma)
const fileRepo  = new FileRepository(prisma)
const graphRepo = new GraphRepository(prisma)
const repoRepo  = new RepositoryRepository(prisma)

async function emit(job: Job, event: object) {
  await job.updateProgress(event)
}

export function startAgentWorker() {
  const worker = new Worker<AgentJobData>('agent-queue', async (job) => {
    const { taskId, agentJobId, rejectionReason } = job.data
    const startTime = Date.now()

    await taskRepo.updateAgentJob(agentJobId, { status: 'RUNNING' })
    await emit(job, { type: 'step', step: 1, label: 'Initialising...', status: 'active' })

    const task = await taskRepo.findById(taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)

    const repo = await repoRepo.findById(task.repositoryId)
    if (!repo) throw new Error(`Repository not found`)

    const github = new GitHubService(repo.githubToken ?? undefined)

    try {
      // Step 1 — Vector search
      await emit(job, { type: 'step', step: 1, label: 'Vector search...', status: 'done' })
      await emit(job, { type: 'step', step: 2, label: 'Searching similar files...', status: 'active' })

      const queryText = `${task.title}\n${task.description}`
      const queryEmbedding = await embedText(queryText)
      const similarFiles = await fileRepo.findSimilar(task.repositoryId, queryEmbedding, 6)

      await emit(job, {
        type: 'context',
        files: similarFiles.map((f) => ({ path: f.path, similarity: f.similarity })),
        dependents: [],
      })
      await taskRepo.appendJobLog(agentJobId, `Vector search: found ${similarFiles.length} similar files`)

      // Step 2 — Graph traversal
      await emit(job, { type: 'step', step: 2, label: 'Graph traversal...', status: 'done' })
      await emit(job, { type: 'step', step: 3, label: 'Traversing knowledge graph...', status: 'active' })

      const primaryFile = similarFiles[0]
      const relatedPaths = similarFiles.slice(1, 4).map((f) => f.path)

      // Find graph edges for primary file
      const primaryNode = await graphRepo.findNodeByFullName(task.repositoryId, primaryFile.path)
      const importers: string[] = []
      const deps: string[] = []
      const entities: string[] = []

      if (primaryNode) {
        const outEdges = await graphRepo.findEdgesFrom(primaryNode.id)
        const inEdges  = await graphRepo.findEdgesTo(primaryNode.id)
        outEdges.forEach((e) => deps.push(e.to.fullName))
        inEdges.forEach((e)  => importers.push(e.from.fullName))
      }

      await emit(job, { type: 'step', step: 3, label: 'Graph traversal done', status: 'done' })

      // Step 3 — Fetch live file content
      await emit(job, { type: 'step', step: 4, label: 'Fetching live file content...', status: 'active' })

      let primaryContent = primaryFile.content
      try {
        primaryContent = await github.getRawContent(repo.owner, repo.name, repo.defaultBranch, primaryFile.path)
      } catch {
        // Fall back to cached content
      }

      const relatedFiles = await Promise.all(
        relatedPaths.map(async (path) => {
          const f = await fileRepo.findByPath(task.repositoryId, path)
          const ext = path.split('.').pop() ?? 'ts'
          return { path, ext, content: f?.content ?? '' }
        }),
      )

      await emit(job, { type: 'step', step: 4, label: 'Files fetched', status: 'done' })

      // Step 4 — Build prompt & call Claude
      await emit(job, { type: 'step', step: 5, label: 'Building prompt...', status: 'active' })

      const ext = primaryFile.path.split('.').pop() ?? 'ts'
      const prompt = buildCodingPrompt({
        title: task.title,
        description: task.description,
        changeType: task.changeType,
        primaryFile: { path: primaryFile.path, ext, content: primaryContent },
        relatedFiles,
        importers,
        deps,
        entities,
        rejectionFeedback: rejectionReason,
      })

      await emit(job, { type: 'step', step: 5, label: 'Calling Claude...', status: 'active' })
      await emit(job, { type: 'log', message: '  Calling claude-sonnet-4-5 (max 4096 tokens)...', level: 'info' })

      const { text, inputTokens, outputTokens } = await callClaude(prompt, CODING_AGENT_SYSTEM, 4096)
      await emit(job, { type: 'log', message: `  Tokens: ${inputTokens} in / ${outputTokens} out`, level: 'ok' })

      // Step 5 — Parse diff
      await emit(job, { type: 'step', step: 5, label: 'Claude done', status: 'done' })
      await emit(job, { type: 'step', step: 6, label: 'Parsing diff...', status: 'active' })

      const parsed = parseDiff(text)
      if (!parsed.diff) {
        throw new Error('Claude did not return a valid diff')
      }

      const patchedContent = applyDiff(primaryContent, parsed.diff)
      await emit(job, { type: 'log', message: `  +${parsed.additions} / -${parsed.deletions} lines`, level: 'ok' })

      const durationMs = Date.now() - startTime
      const tokenCount = inputTokens + outputTokens

      await taskRepo.updateAgentJob(agentJobId, {
        status: 'DONE',
        primaryFilePath: primaryFile.path,
        diffRaw: parsed.diff,
        patchedContent,
        explanation: parsed.explanation,
        tokenCount,
        durationMs,
        completedAt: new Date(),
      })

      await emit(job, { type: 'step', step: 6, label: 'Diff parsed', status: 'done' })

      // Auto-queue review job
      const reviewJob = await taskRepo.createAgentJob({
        taskId,
        attempt: task.attempt,
        agentType: 'REVIEW',
      })
      await taskRepo.updateStatus(taskId, 'REVIEW_RUNNING')
      await reviewQueue.add(JOB.AGENT_REVIEW, {
        taskId,
        agentJobId: reviewJob.id,
        codingJobId: agentJobId,
      }, { jobId: reviewJob.id, attempts: 2 })

      await emit(job, { type: 'log', message: '  Review agent queued', level: 'ok' })
      await emit(job, { type: 'done', jobId: agentJobId })

      logger.info({ taskId, durationMs, tokenCount }, 'Coding agent completed')
      return { agentJobId, reviewJobId: reviewJob.id }

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await taskRepo.updateAgentJob(agentJobId, { status: 'FAILED', completedAt: new Date() })
      await taskRepo.updateStatus(taskId, 'FAILED')
      await emit(job, { type: 'error', message })
      throw err
    }
  }, {
    connection: getRedis() as any,
    concurrency: 3,
  })

  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Agent worker failed'))
  logger.info('AgentWorker started')
  return worker
}
