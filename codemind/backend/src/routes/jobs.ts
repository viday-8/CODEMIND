import { Router } from 'express'
import { NotFoundError } from '../middleware/error'
import { prisma } from '../lib/prisma'
import { initSSE } from '../lib/sse'
import { ingestEvents, agentEvents, reviewEvents, patchEvents } from '../lib/queues'

const router = Router()

// All job event streams (picks the right queue based on job data)
const allEvents = [ingestEvents, agentEvents, reviewEvents, patchEvents]

router.get('/jobs/:jobId/stream', async (req, res) => {
  const { jobId } = req.params
  const sse = initSSE(res)

  // Forward BullMQ events for this jobId to the SSE stream
  const handlers: Array<() => void> = []

  for (const queueEvents of allEvents) {
    const onProgress = ({ jobId: id, data }: { jobId: string; data: unknown }) => {
      if (id === jobId) sse.send(data as object)
    }
    const onCompleted = ({ jobId: id, returnvalue }: { jobId: string; returnvalue: unknown }) => {
      if (id === jobId) {
        sse.send({ type: 'done', ...(returnvalue as object) })
        sse.close()
      }
    }
    const onFailed = ({ jobId: id, failedReason }: { jobId: string; failedReason: string }) => {
      if (id === jobId) {
        sse.send({ type: 'error', message: failedReason })
        sse.close()
      }
    }

    queueEvents.on('progress', onProgress as any)
    queueEvents.on('completed', onCompleted as any)
    queueEvents.on('failed', onFailed as any)

    handlers.push(() => {
      queueEvents.off('progress', onProgress as any)
      queueEvents.off('completed', onCompleted as any)
      queueEvents.off('failed', onFailed as any)
    })
  }

  req.on('close', () => handlers.forEach((h) => h()))
})

router.get('/jobs/:jobId', async (req, res, next) => {
  const start = Date.now()
  try {
    const job = await prisma.ingestJob.findUnique({ where: { id: req.params.jobId } })
    if (!job) throw new NotFoundError('Job not found')
    res.json({ data: job, error: null, meta: { took: Date.now() - start } })
  } catch (err) {
    next(err)
  }
})

export default router
