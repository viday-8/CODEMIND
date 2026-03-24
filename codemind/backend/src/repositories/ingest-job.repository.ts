import { PrismaClient, IngestJob, JobStatus } from '@prisma/client'

export class IngestJobRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(repositoryId: string): Promise<IngestJob> {
    return this.prisma.ingestJob.create({ data: { repositoryId } })
  }

  async findById(id: string): Promise<IngestJob | null> {
    return this.prisma.ingestJob.findUnique({ where: { id } })
  }

  async updateStatus(id: string, status: JobStatus, extras?: {
    progress?: number
    errorMessage?: string
  }): Promise<IngestJob> {
    return this.prisma.ingestJob.update({
      where: { id },
      data: {
        status,
        ...(extras?.progress !== undefined && { progress: extras.progress }),
        ...(extras?.errorMessage && { errorMessage: extras.errorMessage }),
        ...(status === 'RUNNING' && { startedAt: new Date() }),
        ...(status === 'DONE' || status === 'FAILED' ? { completedAt: new Date() } : {}),
      },
    })
  }

  async appendLog(id: string, message: string): Promise<void> {
    await this.prisma.ingestJob.update({
      where: { id },
      data: { log: { push: message } },
    })
  }
}
