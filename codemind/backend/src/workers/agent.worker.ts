import { Worker, Job } from 'bullmq'
import { getRedis } from '../lib/redis'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { TaskRepository } from '../repositories/task.repository'
import { GraphRepository } from '../repositories/graph.repository'
import { RepositoryRepository } from '../repositories/repository.repository'
import { GitHubService } from '../lib/github'
import { embedText } from '../lib/embedder'
import { callClaude } from '../lib/claude'
import { buildCodingPrompt, CODING_AGENT_SYSTEM } from '../lib/prompts'
import { parseMultiFileDiff, applyDiff } from '../lib/diff'
import { reviewQueue, JOB } from '../lib/queues'
import { ChunkRepository } from '../repositories/chunk.repository'
import type { FileChange } from '@codemind/shared'

interface AgentJobData {
  taskId: string
  agentJobId: string
  rejectionReason?: string
}

const taskRepo  = new TaskRepository(prisma)
const graphRepo = new GraphRepository(prisma)
const repoRepo  = new RepositoryRepository(prisma)
const chunkRepo = new ChunkRepository(prisma)

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
      // Step 1 — Chunk-level semantic search (top 20 chunks)
      await emit(job, { type: 'step', step: 1, label: 'Chunk search...', status: 'done' })
      await emit(job, { type: 'step', step: 2, label: 'Searching code chunks...', status: 'active' })

      const queryText = `${task.title}\n${task.description}`
      const queryEmbedding = await embedText(queryText)
      const similarChunks = await chunkRepo.findSimilar(task.repositoryId, queryEmbedding, 20)

      // Group chunks by file path, preserving insertion order (best match first)
      const fileChunkMap = new Map<string, typeof similarChunks>()
      for (const chunk of similarChunks) {
        if (!fileChunkMap.has(chunk.path)) fileChunkMap.set(chunk.path, [])
        fileChunkMap.get(chunk.path)!.push(chunk)
      }

      // Top 8 unique files by first-chunk similarity
      const topFilePaths = [...fileChunkMap.keys()].slice(0, 8)

      await emit(job, {
        type: 'context',
        files: topFilePaths.map((p) => ({
          path: p,
          similarity: fileChunkMap.get(p)![0].similarity,
          chunks: fileChunkMap.get(p)!.map((c) => ({ name: c.name, startLine: c.startLine, endLine: c.endLine })),
        })),
        dependents: [],
      })
      await taskRepo.appendJobLog(agentJobId, `Chunk search: ${similarChunks.length} chunks across ${topFilePaths.length} files`)

      // Step 2 — Graph traversal for matched files
      await emit(job, { type: 'step', step: 2, label: 'Graph traversal...', status: 'done' })
      await emit(job, { type: 'step', step: 3, label: 'Traversing knowledge graph...', status: 'active' })

      const fileContextMap = new Map<string, { importers: string[]; deps: string[] }>()
      for (const filePath of topFilePaths) {
        const node = await graphRepo.findNodeByFullName(task.repositoryId, filePath)
        const importers: string[] = []
        const deps: string[] = []
        if (node) {
          const outEdges = await graphRepo.findEdgesFrom(node.id)
          const inEdges  = await graphRepo.findEdgesTo(node.id)
          outEdges.forEach((e) => deps.push(e.to.fullName))
          inEdges.forEach((e)  => importers.push(e.from.fullName))
        }
        fileContextMap.set(filePath, { importers, deps })
      }

      await emit(job, { type: 'step', step: 3, label: 'Graph traversal done', status: 'done' })

      // Step 3 — Build focused context from matched chunks per file
      await emit(job, { type: 'step', step: 4, label: 'Building chunk context...', status: 'active' })

      const candidateFiles = await Promise.all(
        topFilePaths.map(async (filePath) => {
          const chunks = fileChunkMap.get(filePath)!
          const headerChunk = chunks.find((c) => c.chunkType === 'FILE_HEADER')
          const symbolChunks = chunks
            .filter((c) => c.chunkType !== 'FILE_HEADER')
            .sort((a, b) => a.startLine - b.startLine)

          // Try to fetch live header if we have no FILE_HEADER chunk
          let headerContent = headerChunk?.content ?? ''
          if (!headerContent) {
            try {
              const liveContent = await github.getRawContent(repo.owner, repo.name, repo.defaultBranch, filePath)
              // Use first 30 lines as imports/header context
              headerContent = liveContent.split('\n').slice(0, 30).join('\n')
            } catch { /* skip */ }
          }

          const contentParts = [
            headerContent ? `// --- imports/header ---\n${headerContent}` : '',
            ...symbolChunks.map((c) => `// --- ${c.name ?? c.chunkType} (lines ${c.startLine}-${c.endLine}) ---\n${c.content}`),
          ].filter(Boolean)

          const ctx = fileContextMap.get(filePath) ?? { importers: [], deps: [] }
          return {
            path: filePath,
            ext: filePath.split('.').pop() ?? 'ts',
            content: contentParts.join('\n\n'),
            importers: ctx.importers,
            deps: ctx.deps,
          }
        })
      )

      await emit(job, { type: 'step', step: 4, label: 'Context ready', status: 'done' })

      // Step 4 — Build multi-file prompt & call Claude
      await emit(job, { type: 'step', step: 5, label: 'Building prompt...', status: 'active' })

      const prompt = buildCodingPrompt({
        title: task.title,
        description: task.description,
        changeType: task.changeType,
        candidateFiles,
        rejectionFeedback: rejectionReason,
      })

      await emit(job, { type: 'step', step: 5, label: 'Calling Claude...', status: 'active' })
      await emit(job, { type: 'log', message: `  Calling claude-sonnet-4-5 (max 6000 tokens, ${candidateFiles.length} candidate files)...`, level: 'info' })

      const { text, inputTokens, outputTokens } = await callClaude(prompt, CODING_AGENT_SYSTEM, 6000)
      await emit(job, { type: 'log', message: `  Tokens: ${inputTokens} in / ${outputTokens} out`, level: 'ok' })

      // Step 5 — Parse multi-file diff
      await emit(job, { type: 'step', step: 5, label: 'Claude done', status: 'done' })
      await emit(job, { type: 'step', step: 6, label: 'Parsing changes...', status: 'active' })

      const parsed = parseMultiFileDiff(text)
      if (parsed.fileChanges.length === 0) {
        throw new Error('Claude did not return any valid file changes')
      }

      await emit(job, { type: 'log', message: `  ${parsed.fileChanges.length} file(s) changed: +${parsed.totalAdditions} / -${parsed.totalDeletions} lines`, level: 'ok' })

      // Apply diffs for modified files to produce final content
      const fileChangesWithContent: FileChange[] = await Promise.all(
        parsed.fileChanges.map(async (fc) => {
          if (fc.operation === 'create') return fc
          const original = candidateFiles.find((cf) => cf.path === fc.path)?.content ?? ''
          return { ...fc, content: applyDiff(original, fc.diff ?? '') }
        })
      )

      const primaryChange = fileChangesWithContent[0]
      const durationMs = Date.now() - startTime
      const tokenCount = inputTokens + outputTokens

      await taskRepo.updateAgentJob(agentJobId, {
        status: 'DONE',
        // Backward compat: always set these to the first change
        primaryFilePath: primaryChange.path,
        diffRaw: primaryChange.diff ?? '',
        patchedContent: primaryChange.content ?? '',
        // New: full multi-file payload
        fileChanges: fileChangesWithContent as object,
        explanation: parsed.explanation,
        tokenCount,
        durationMs,
        completedAt: new Date(),
      })

      await emit(job, { type: 'step', step: 6, label: 'Changes parsed', status: 'done' })

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

      logger.info({ taskId, durationMs, tokenCount, fileCount: fileChangesWithContent.length }, 'Coding agent completed')
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
