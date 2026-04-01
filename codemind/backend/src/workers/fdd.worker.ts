import { Worker, Job } from 'bullmq'
import { getRedis } from '../lib/redis'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { FddRepository } from '../repositories/fdd.repository'
import { ChunkRepository } from '../repositories/chunk.repository'
import { parseDocument } from '../services/fdd-parser.service'
import { extractRequirements } from '../services/fdd-extraction.service'
import { analyzeRequirement } from '../services/fdd-gap-analysis.service'
import { JOB } from '../lib/queues'

interface FddJobData {
  fddId: string
  buffer: string        // base64-encoded file buffer
  mimeType: string
  repositoryId: string
}

const fddRepo   = new FddRepository(prisma)
const chunkRepo = new ChunkRepository(prisma)

async function emitStep(job: Job, step: number, label: string, status: 'active' | 'done' | 'error') {
  await job.updateProgress({ type: 'step', step, label, status })
}

export function startFddWorker() {
  const worker = new Worker(
    'fdd-queue',
    async (job: Job<FddJobData>) => {
      const { fddId, buffer: bufferB64, mimeType, repositoryId } = job.data

      try {
        // Step 1: Parse document
        await fddRepo.updateStatus(fddId, 'PARSING')
        await emitStep(job, 1, 'Parsing document...', 'active')

        const fileBuffer = Buffer.from(bufferB64, 'base64')
        const rawText = await parseDocument(fileBuffer, mimeType)
        await fddRepo.setRawText(fddId, rawText)
        await emitStep(job, 1, 'Document parsed', 'done')

        // Step 2: Extract requirements via Claude
        await fddRepo.updateStatus(fddId, 'EXTRACTING')
        await emitStep(job, 2, 'Extracting requirements...', 'active')

        const rawRequirements = await extractRequirements(rawText)
        const requirements = await fddRepo.upsertRequirements(fddId, rawRequirements)
        await emitStep(job, 2, `Extracted ${requirements.length} requirements`, 'done')

        // Step 3: Gap analysis (vector search per requirement, batched 5 at a time)
        await fddRepo.updateStatus(fddId, 'ANALYZING')
        await emitStep(job, 3, `Analyzing ${requirements.length} requirements...`, 'active')

        const batchSize = 5
        for (let i = 0; i < requirements.length; i += batchSize) {
          const batch = requirements.slice(i, i + batchSize)
          await Promise.all(
            batch.map(async (req) => {
              const result = await analyzeRequirement(repositoryId, req, chunkRepo)
              await fddRepo.updateRequirementClassification(req.id, result.classification, result.rationale)
            })
          )
          const done = Math.min(i + batchSize, requirements.length)
          await emitStep(job, 3, `Gap analysis ${done}/${requirements.length}...`, 'active')
        }

        await emitStep(job, 3, 'Gap analysis complete', 'done')

        // Step 4: Ready
        await fddRepo.updateStatus(fddId, 'READY')
        await emitStep(job, 4, 'Analysis complete', 'done')
        await job.updateProgress({ type: 'done', jobId: job.id })

        logger.info({ fddId, requirementCount: requirements.length }, 'FDD analysis complete')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error({ fddId, err }, 'FDD analysis failed')
        await fddRepo.updateStatus(fddId, 'FAILED', message)
        await emitStep(job, 0, `Failed: ${message}`, 'error')
        throw err
      }
    },
    {
      connection: getRedis() as any,
      concurrency: 2,
    }
  )

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'FDD worker job failed')
  })

  logger.info('FddWorker started')
  return worker
}
