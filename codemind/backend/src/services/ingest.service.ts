import { RepositoryRepository } from '../repositories/repository.repository'
import { IngestJobRepository } from '../repositories/ingest-job.repository'
import { ingestQueue, JOB } from '../lib/queues'
import { ConflictError, ValidationError } from '../middleware/error'

export class IngestService {
  constructor(
    private readonly repoRepo: RepositoryRepository,
    private readonly jobRepo: IngestJobRepository,
  ) {}

  async connectRepository(url: string, token?: string, branch?: string) {
    const parsed = this.parseGitHubUrl(url)
    if (!parsed) throw new ValidationError('Invalid GitHub URL. Expected: https://github.com/owner/repo')

    const { owner, name } = parsed
    const fullName = `${owner}/${name}`

    const existing = await this.repoRepo.findByFullName(fullName)
    if (existing) throw new ConflictError(`Repository ${fullName} is already connected`)

    const repo = await this.repoRepo.create({
      owner,
      name,
      fullName,
      defaultBranch: branch ?? 'main',
      githubToken: token,
    })

    return repo
  }

  async queueIngest(repositoryId: string) {
    const repo = await this.repoRepo.findById(repositoryId)
    if (!repo) throw new Error(`Repository ${repositoryId} not found`)

    const job = await this.jobRepo.create(repositoryId)

    await this.repoRepo.updateStatus(repositoryId, 'INGESTING')

    await ingestQueue.add(JOB.INGEST, { repositoryId, jobId: job.id }, {
      jobId: job.id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    })

    return job
  }

  private parseGitHubUrl(url: string): { owner: string; name: string } | null {
    try {
      const u = new URL(url)
      if (u.hostname !== 'github.com') return null
      const parts = u.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/')
      if (parts.length < 2 || !parts[0] || !parts[1]) return null
      return { owner: parts[0], name: parts[1] }
    } catch {
      return null
    }
  }
}
