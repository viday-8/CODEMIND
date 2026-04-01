import { Queue, QueueEvents } from 'bullmq'
import { getRedis } from './redis'

const connection = { host: 'unused', port: 0 } as const

function makeQueue(name: string) {
  return new Queue(name, { connection: getRedis() as any })
}

function makeQueueEvents(name: string) {
  return new QueueEvents(name, { connection: getRedis() as any })
}

export const ingestQueue  = makeQueue('ingest-queue')
export const agentQueue   = makeQueue('agent-queue')
export const reviewQueue  = makeQueue('review-queue')
export const patchQueue   = makeQueue('patch-queue')
export const fddQueue     = makeQueue('fdd-queue')

export const ingestEvents  = makeQueueEvents('ingest-queue')
export const agentEvents   = makeQueueEvents('agent-queue')
export const reviewEvents  = makeQueueEvents('review-queue')
export const patchEvents   = makeQueueEvents('patch-queue')
export const fddEvents     = makeQueueEvents('fdd-queue')

// Job name constants
export const JOB = {
  INGEST: 'ingest',
  AGENT_CODING: 'agent-coding',
  AGENT_REVIEW: 'agent-review',
  PATCH: 'patch',
  FDD_ANALYZE: 'fdd-analyze',
} as const
