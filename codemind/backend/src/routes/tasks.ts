import { Router } from 'express'
import { validate } from '../middleware/validate'
import { NotFoundError, ForbiddenError } from '../middleware/error'
import { TaskRepository } from '../repositories/task.repository'
import { prisma } from '../lib/prisma'
import { CreateTaskSchema, RejectTaskSchema } from '@codemind/shared'
import { agentQueue, patchQueue, JOB } from '../lib/queues'

const router = Router()
const taskRepo = new TaskRepository(prisma)

router.post('/tasks', validate(CreateTaskSchema), async (req, res, next) => {
  const start = Date.now()
  try {
    const task = await taskRepo.create({ ...req.body })

    // Immediately queue the coding agent
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

    res.status(201).json({ data: { ...task, agentJobId: agentJob.id }, error: null, meta: { took: Date.now() - start } })
  } catch (err) { next(err) }
})

router.get('/tasks', async (req, res, next) => {
  const start = Date.now()
  try {
    const { repoId, status } = req.query as { repoId?: string; status?: string }
    const tasks = await taskRepo.findAll({
      repositoryId: repoId,
      status: status as any,
    })
    res.json({ data: tasks, error: null, meta: { took: Date.now() - start } })
  } catch (err) { next(err) }
})

router.get('/tasks/:id', async (req, res, next) => {
  const start = Date.now()
  try {
    const task = await taskRepo.findById(req.params.id)
    if (!task) throw new NotFoundError('Task not found')
    res.json({ data: task, error: null, meta: { took: Date.now() - start } })
  } catch (err) { next(err) }
})

router.delete('/tasks/:id', async (req, res, next) => {
  const start = Date.now()
  try {
    const task = await taskRepo.findById(req.params.id)
    if (!task) throw new NotFoundError('Task not found')
    await taskRepo.delete(req.params.id)
    res.status(204).end()
  } catch (err) { next(err) }
})

router.get('/tasks/:id/approval', async (req, res, next) => {
  const start = Date.now()
  try {
    const task = await taskRepo.findById(req.params.id)
    if (!task) throw new NotFoundError('Task not found')
    res.json({ data: task, error: null, meta: { took: Date.now() - start } })
  } catch (err) { next(err) }
})

router.post('/tasks/:id/approve', async (req, res, next) => {
  const start = Date.now()
  try {
    const task = await taskRepo.findById(req.params.id)
    if (!task) throw new NotFoundError('Task not found')
    if (task.status !== 'AWAITING_APPROVAL') {
      throw new ForbiddenError('Task is not awaiting approval')
    }

    await taskRepo.createApproval({
      taskId: task.id,
      decision: 'APPROVED',
    })
    await taskRepo.updateStatus(task.id, 'PATCHING')

    const latestAgentJob = [...task.agentJobs].reverse().find((j) => j.agentType === 'CODING')
    const prJob = await patchQueue.add(JOB.PATCH, {
      taskId: task.id,
      agentJobId: latestAgentJob?.id,
    }, { attempts: 2 })

    res.json({ data: { prJobId: prJob.id }, error: null, meta: { took: Date.now() - start } })
  } catch (err) { next(err) }
})

router.post('/tasks/:id/reject', validate(RejectTaskSchema), async (req, res, next) => {
  const start = Date.now()
  try {
    const task = await taskRepo.findById(req.params.id)
    if (!task) throw new NotFoundError('Task not found')

    const MAX_ATTEMPTS = 5
    if (task.attempt >= MAX_ATTEMPTS) {
      await taskRepo.updateStatus(task.id, 'FAILED')
      res.json({ data: { message: 'Max retry attempts reached' }, error: null, meta: { took: Date.now() - start } })
      return
    }

    await taskRepo.createApproval({
      taskId: task.id,
      decision: 'REJECTED',
      reason: req.body.reason,
    })
    await taskRepo.incrementAttempt(task.id)
    const newAttempt = task.attempt + 1

    const agentJob = await taskRepo.createAgentJob({
      taskId: task.id,
      attempt: newAttempt,
      agentType: 'CODING',
      rejectionReason: req.body.reason,
    })
    await taskRepo.updateStatus(task.id, 'AGENT_RUNNING')
    await agentQueue.add(JOB.AGENT_CODING, {
      taskId: task.id,
      agentJobId: agentJob.id,
      rejectionReason: req.body.reason,
    }, {
      jobId: agentJob.id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    })

    res.json({ data: { agentJobId: agentJob.id }, error: null, meta: { took: Date.now() - start } })
  } catch (err) { next(err) }
})

router.get('/tasks/:id/patch-script', async (req, res, next) => {
  try {
    const task = await taskRepo.findById(req.params.id)
    if (!task) throw new NotFoundError('Task not found')

    const agentJob = task.agentJobs[0]
    if (!agentJob?.patchedContent || !agentJob.primaryFilePath) {
      throw new NotFoundError('No patch available for this task')
    }

    const slug = task.title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40)
    const branchName = `ai/${slug}`
    const script = generatePatchScript(agentJob.primaryFilePath, agentJob.patchedContent, branchName, task.title)

    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('Content-Disposition', `attachment; filename="patch-${task.id}.sh"`)
    res.send(script)
  } catch (err) { next(err) }
})

function generatePatchScript(filePath: string, content: string, branch: string, title: string): string {
  const escaped = content.replace(/'/g, "'\\''")
  return `#!/bin/bash
# CodeMind patch script
# Task: ${title}
# Generated: ${new Date().toISOString()}

set -e

BRANCH="${branch}"
FILE_PATH="${filePath}"

git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"

cat > "$FILE_PATH" << 'CODEMIND_EOF'
${escaped}
CODEMIND_EOF

git add "$FILE_PATH"
git commit -m "feat: ${title.replace(/"/g, '\\"')}"

echo "✅ Patch applied to branch: $BRANCH"
echo "   Run: git push origin $BRANCH"
`
}

export default router
