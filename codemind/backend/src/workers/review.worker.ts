import { Worker, Job } from 'bullmq'
import { getRedis } from '../lib/redis'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { TaskRepository } from '../repositories/task.repository'
import { callClaude } from '../lib/claude'
import { buildReviewPrompt, REVIEW_AGENT_SYSTEM } from '../lib/prompts'
import type { ReviewOutput, FileChange } from '@codemind/shared'

interface ReviewJobData {
  taskId: string
  agentJobId: string
  codingJobId: string
}

const taskRepo = new TaskRepository(prisma)

function runHeuristics(diff: string): ReviewOutput['comments'] {
  const comments: ReviewOutput['comments'] = []
  if (/console\.log/.test(diff)) {
    comments.push({ severity: 'warning', category: 'style', text: 'console.log left in diff — remove before merging' })
  }
  if (/password\s*=\s*['"][^'"]{3,}['"]|secret\s*=\s*['"][^'"]{3,}['"]/i.test(diff)) {
    comments.push({ severity: 'blocking', category: 'security', text: 'Potential hardcoded secret detected' })
  }
  const addedLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length
  if (addedLines > 200) {
    comments.push({ severity: 'warning', category: 'scope', text: `Diff is large (${addedLines} additions) — consider splitting` })
  }
  return comments
}

async function emit(job: Job, event: object) {
  await job.updateProgress(event)
}

export function startReviewWorker() {
  const worker = new Worker<ReviewJobData>('review-queue', async (job) => {
    const { taskId, agentJobId, codingJobId } = job.data

    await taskRepo.updateAgentJob(agentJobId, { status: 'RUNNING' })
    await emit(job, { type: 'log', message: '  Review agent started', level: 'info' })

    const codingJob = await taskRepo.findAgentJobById(codingJobId)

    const fileChanges = (codingJob?.fileChanges as FileChange[] | null) ?? null
    if ((!codingJob?.diffRaw || !codingJob.primaryFilePath) && !fileChanges?.length) {
      throw new Error('No diff found from coding agent')
    }

    const task = await taskRepo.findById(taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)

    // Build combined diff: use all fileChanges if available, otherwise fall back to single diffRaw
    const combinedDiff = fileChanges?.length
      ? fileChanges.filter((fc) => fc.diff).map((fc) => `=== ${fc.path} ===\n${fc.diff}`).join('\n\n')
      : codingJob?.diffRaw ?? ''
    const primaryPath = fileChanges?.[0]?.path ?? codingJob?.primaryFilePath ?? ''

    // Heuristic checks
    const heuristicComments = runHeuristics(combinedDiff)
    await emit(job, { type: 'log', message: `  Heuristics: ${heuristicComments.length} comment(s)`, level: 'info' })

    // Claude AI review
    await emit(job, { type: 'log', message: '  Calling Claude for AI review...', level: 'info' })
    const prompt = buildReviewPrompt({
      title: task.title,
      diff: combinedDiff,
      filePath: primaryPath,
    })

    let aiOutput: ReviewOutput = { verdict: 'pass', summary: 'Review could not be parsed', comments: [] }
    try {
      const { text } = await callClaude(prompt, REVIEW_AGENT_SYSTEM, 1024)
      aiOutput = JSON.parse(text) as ReviewOutput
    } catch (err) {
      logger.warn({ err }, 'Failed to parse AI review — using heuristics only')
    }

    // Merge comments
    const allComments = [...heuristicComments, ...aiOutput.comments]

    // Final verdict: BLOCK > WARN > PASS
    let finalVerdict: 'PASS' | 'WARN' | 'BLOCK' = 'PASS'
    if (allComments.some((c) => c.severity === 'blocking')) finalVerdict = 'BLOCK'
    else if (allComments.some((c) => c.severity === 'warning')) finalVerdict = 'WARN'

    await taskRepo.updateAgentJob(agentJobId, {
      status: 'DONE',
      verdict: finalVerdict,
      reviewSummary: aiOutput.summary,
      reviewComments: allComments as object,
      completedAt: new Date(),
    })

    await taskRepo.updateStatus(taskId, 'AWAITING_APPROVAL')

    await emit(job, { type: 'log', message: `  Verdict: ${finalVerdict}`, level: finalVerdict === 'BLOCK' ? 'error' : 'ok' })
    await emit(job, { type: 'done', verdict: finalVerdict, jobId: agentJobId })

    logger.info({ taskId, verdict: finalVerdict }, 'Review agent completed')
    return { verdict: finalVerdict }
  }, {
    connection: getRedis() as any,
    concurrency: 3,
  })

  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Review worker failed'))
  logger.info('ReviewWorker started')
  return worker
}
