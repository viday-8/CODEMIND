import { Router, Request } from 'express'
import multer from 'multer'
import { validate } from '../middleware/validate'
import { NotFoundError, ValidationError } from '../middleware/error'
import { FddRepository } from '../repositories/fdd.repository'
import { TaskRepository } from '../repositories/task.repository'
import { prisma } from '../lib/prisma'
import { ExecuteFddSchema } from '@codemind/shared'
import { fddQueue, agentQueue, JOB } from '../lib/queues'

const router = Router()
const fddRepo  = new FddRepository(prisma)
const taskRepo = new TaskRepository(prisma)

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIME_TYPES.includes(file.mimetype))
  },
})

// POST /api/fdd/upload — upload a document and start async analysis
router.post('/fdd/upload', upload.single('document'), async (req: Request, res, next) => {
  const start = Date.now()
  try {
    if (!req.file) {
      throw new ValidationError('No file uploaded or unsupported file type. Allowed: PDF, DOCX, TXT, MD')
    }
    const { repositoryId } = req.body
    if (!repositoryId || typeof repositoryId !== 'string') {
      throw new ValidationError('repositoryId is required')
    }

    const fdd = await fddRepo.create({
      repositoryId,
      uploadedById: (req as any).user?.id,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
    })

    // Encode buffer as base64 for BullMQ (job data must be JSON-serializable)
    const bufferB64 = req.file.buffer.toString('base64')

    const bullJob = await fddQueue.add(
      JOB.FDD_ANALYZE,
      { fddId: fdd.id, buffer: bufferB64, mimeType: req.file.mimetype, repositoryId },
      { jobId: fdd.id, attempts: 2, backoff: { type: 'fixed', delay: 3000 } },
    )

    await fddRepo.setBullJobId(fdd.id, bullJob.id!)

    res.status(201).json({
      data: { fddId: fdd.id, bullJobId: bullJob.id, status: fdd.status },
      error: null,
      meta: { took: Date.now() - start },
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/fdd/:id — get FDD with requirements
router.get('/fdd/:id', async (req, res, next) => {
  const start = Date.now()
  try {
    const fdd = await fddRepo.findById(req.params.id)
    if (!fdd) throw new NotFoundError('FDD not found')
    res.json({ data: fdd, error: null, meta: { took: Date.now() - start } })
  } catch (err) {
    next(err)
  }
})

// GET /api/fdd — list FDDs for a repo
router.get('/fdd', async (req, res, next) => {
  const start = Date.now()
  try {
    const { repoId } = req.query
    if (!repoId || typeof repoId !== 'string') {
      throw new ValidationError('repoId query param is required')
    }
    const fdds = await fddRepo.findByRepo(repoId)
    res.json({ data: fdds, error: null, meta: { took: Date.now() - start } })
  } catch (err) {
    next(err)
  }
})

// POST /api/fdd/:id/execute — spawn Tasks for selected requirements
router.post('/fdd/:id/execute', validate(ExecuteFddSchema), async (req, res, next) => {
  const start = Date.now()
  try {
    const fdd = await fddRepo.findById(req.params.id)
    if (!fdd) throw new NotFoundError('FDD not found')

    const { requirementIds, model } = req.body as { requirementIds: string[]; model: string }
    const results: Array<{ requirementId: string; taskId: string }> = []

    for (const reqId of requirementIds) {
      const requirement = fdd.requirements.find((r) => r.id === reqId)
      if (!requirement) continue
      // Skip already-linked or EXISTING requirements
      if (requirement.taskId) continue
      if (requirement.classification === 'EXISTING') continue

      const task = await taskRepo.create({
        repositoryId: fdd.repositoryId,
        title: requirement.title,
        description: requirement.description,
        changeType: 'REQUIREMENT',
        model,
      })

      const agentJob = await taskRepo.createAgentJob({
        taskId: task.id,
        attempt: 1,
        agentType: 'CODING',
      })

      await taskRepo.updateStatus(task.id, 'AGENT_RUNNING')
      await agentQueue.add(JOB.AGENT_CODING, { taskId: task.id, agentJobId: agentJob.id }, {
        jobId: agentJob.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      })

      await fddRepo.linkRequirementToTask(reqId, task.id)
      results.push({ requirementId: reqId, taskId: task.id })
    }

    res.json({ data: results, error: null, meta: { took: Date.now() - start } })
  } catch (err) {
    next(err)
  }
})

export default router
