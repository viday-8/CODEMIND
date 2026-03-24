import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IngestService } from './ingest.service'
import { RepositoryRepository } from '../repositories/repository.repository'
import { IngestJobRepository } from '../repositories/ingest-job.repository'
import { ConflictError, ValidationError } from '../middleware/error'

// Mock BullMQ queue so tests don't need Redis
vi.mock('../lib/queues', () => ({
  ingestQueue: { add: vi.fn().mockResolvedValue({ id: 'bullmq-job-1' }) },
  JOB: { INGEST: 'ingest' },
}))

const FAKE_REPO = {
  id: 'repo-1', owner: 'expressjs', name: 'express',
  fullName: 'expressjs/express', defaultBranch: 'master',
  githubToken: null, status: 'PENDING' as const,
  lastIngestedAt: null, createdAt: new Date(),
}

const FAKE_JOB = {
  id: 'job-1', repositoryId: 'repo-1',
  status: 'QUEUED' as const, progress: 0, log: [],
  startedAt: null, completedAt: null, errorMessage: null, createdAt: new Date(),
}

function makeRepoRepo(overrides = {}): RepositoryRepository {
  return {
    create:      vi.fn().mockResolvedValue(FAKE_REPO),
    findAll:     vi.fn().mockResolvedValue([FAKE_REPO]),
    findById:    vi.fn().mockResolvedValue(FAKE_REPO),
    findByFullName: vi.fn().mockResolvedValue(null),
    updateStatus: vi.fn().mockResolvedValue(FAKE_REPO),
    updateLastIngested: vi.fn(),
    getStats:    vi.fn(),
    delete:      vi.fn(),
    ...overrides,
  } as unknown as RepositoryRepository
}

function makeJobRepo(overrides = {}): IngestJobRepository {
  return {
    create:        vi.fn().mockResolvedValue(FAKE_JOB),
    findById:      vi.fn().mockResolvedValue(FAKE_JOB),
    updateStatus:  vi.fn().mockResolvedValue(FAKE_JOB),
    appendLog:     vi.fn(),
    ...overrides,
  } as unknown as IngestJobRepository
}

describe('IngestService.connectRepository', () => {
  it('happy path — parses GitHub URL and creates repo record', async () => {
    const repoRepo = makeRepoRepo()
    const svc = new IngestService(repoRepo, makeJobRepo())

    const repo = await svc.connectRepository('https://github.com/expressjs/express')

    expect(repoRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'expressjs', name: 'express', fullName: 'expressjs/express' }),
    )
    expect(repo.fullName).toBe('expressjs/express')
  })

  it('error path — throws ConflictError when repo already connected', async () => {
    const repoRepo = makeRepoRepo({ findByFullName: vi.fn().mockResolvedValue(FAKE_REPO) })
    const svc = new IngestService(repoRepo, makeJobRepo())

    await expect(svc.connectRepository('https://github.com/expressjs/express'))
      .rejects.toThrow(ConflictError)
  })

  it('error path — throws ValidationError on non-GitHub URL', async () => {
    const svc = new IngestService(makeRepoRepo(), makeJobRepo())

    await expect(svc.connectRepository('https://gitlab.com/foo/bar'))
      .rejects.toThrow(ValidationError)
  })

  it('error path — throws ValidationError on malformed URL', async () => {
    const svc = new IngestService(makeRepoRepo(), makeJobRepo())

    await expect(svc.connectRepository('not-a-url'))
      .rejects.toThrow(ValidationError)
  })
})

describe('IngestService.queueIngest', () => {
  it('happy path — creates job and queues BullMQ job', async () => {
    const repoRepo = makeRepoRepo()
    const jobRepo  = makeJobRepo()
    const svc = new IngestService(repoRepo, jobRepo)

    const job = await svc.queueIngest('repo-1')

    expect(jobRepo.create).toHaveBeenCalledWith('repo-1')
    expect(repoRepo.updateStatus).toHaveBeenCalledWith('repo-1', 'INGESTING')
    expect(job.id).toBe('job-1')
  })

  it('error path — throws when repository not found', async () => {
    const repoRepo = makeRepoRepo({ findById: vi.fn().mockResolvedValue(null) })
    const svc = new IngestService(repoRepo, makeJobRepo())

    await expect(svc.queueIngest('missing-repo'))
      .rejects.toThrow('not found')
  })
})
