import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

router.get('/health', async (_req, res) => {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({
      data: { status: 'ok', db: 'connected' },
      error: null,
      meta: { took: Date.now() - start },
    })
  } catch {
    res.status(503).json({
      data: { status: 'degraded', db: 'disconnected' },
      error: null,
      meta: { took: Date.now() - start },
    })
  }
})

export default router
