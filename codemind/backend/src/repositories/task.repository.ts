import { PrismaClient, Task, TaskStatus, AgentJob, AgentType, JobStatus } from '@prisma/client'

export class TaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    repositoryId: string
    requesterId?: string
    title: string
    description: string
    changeType: Task['changeType']
  }): Promise<Task> {
    return this.prisma.task.create({ data })
  }

  async findAll(filters?: { repositoryId?: string; status?: TaskStatus }): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: {
        ...(filters?.repositoryId && { repositoryId: filters.repositoryId }),
        ...(filters?.status && { status: filters.status }),
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findById(id: string) {
    return this.prisma.task.findUnique({
      where: { id },
      include: {
        repository: true,
        requester: { select: { id: true, name: true, email: true, role: true } },
        agentJobs: { orderBy: { createdAt: 'asc' } },
        approval: true,
        pullRequest: true,
      },
    })
  }

  async updateStatus(id: string, status: TaskStatus): Promise<Task> {
    return this.prisma.task.update({ where: { id }, data: { status } })
  }

  async incrementAttempt(id: string): Promise<Task> {
    return this.prisma.task.update({ where: { id }, data: { attempt: { increment: 1 } } })
  }

  async createAgentJob(data: {
    taskId: string
    attempt: number
    agentType: AgentType
    rejectionReason?: string
  }): Promise<AgentJob> {
    return this.prisma.agentJob.create({ data })
  }

  async updateAgentJob(id: string, data: Partial<{
    status: JobStatus
    primaryFilePath: string
    diffRaw: string
    patchedContent: string
    fileChanges: object
    explanation: string
    verdict: AgentJob['verdict']
    reviewSummary: string
    reviewComments: object
    tokenCount: number
    durationMs: number
    completedAt: Date
  }>): Promise<AgentJob> {
    return this.prisma.agentJob.update({ where: { id }, data })
  }

  async appendJobLog(id: string, message: string): Promise<void> {
    await this.prisma.agentJob.update({
      where: { id },
      data: { log: { push: message } },
    })
  }

  async findAgentJobById(id: string): Promise<AgentJob | null> {
    return this.prisma.agentJob.findUnique({ where: { id } })
  }

  async createApproval(data: {
    taskId: string
    reviewerId?: string
    decision: 'APPROVED' | 'REJECTED'
    reason?: string
  }) {
    return this.prisma.approval.create({ data })
  }

  async createPullRequest(data: {
    taskId: string
    repoFullName: string
    prNumber: number
    branchName: string
    prUrl: string
    title: string
  }) {
    return this.prisma.pullRequest.create({ data })
  }
}
