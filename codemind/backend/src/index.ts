import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import pinoHttp from 'pino-http'
import { config } from './config'
import { logger } from './lib/logger'
import { errorMiddleware } from './middleware/error'
import healthRouter from './routes/health'
import reposRouter  from './routes/repos'
import tasksRouter  from './routes/tasks'
import jobsRouter   from './routes/jobs'
import fddRouter    from './routes/fdd'
import { startIngestWorker } from './workers/ingest.worker'
import { startAgentWorker }  from './workers/agent.worker'
import { startReviewWorker } from './workers/review.worker'
import { startPatchWorker }  from './workers/patch.worker'
import { startFddWorker }    from './workers/fdd.worker'

const app = express()

app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))

// Structured HTTP request logging (skip /api/jobs SSE streams to avoid noise)
app.use(pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url?.startsWith('/api/jobs') ?? false },
}))

app.use((req, _res, next) => {
  req.startTime = Date.now()
  next()
})

// API routes
app.use('/api', healthRouter)
app.use('/api', reposRouter)
app.use('/api', tasksRouter)
app.use('/api', jobsRouter)
app.use('/api', fddRouter)

// 404
app.use((_req, res) => {
  res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Route not found' }, meta: { took: 0 } })
})

app.use(errorMiddleware)

app.listen(config.PORT, () => {
  logger.info(`🚀 CodeMind backend running on http://localhost:${config.PORT}`)
})

// Start all BullMQ workers in the same process
startIngestWorker()
startAgentWorker()
startReviewWorker()
startPatchWorker()
startFddWorker()

export default app
