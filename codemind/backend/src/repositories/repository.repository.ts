import { PrismaClient, Repository, RepoStatus } from '@prisma/client'

export class RepositoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    owner: string
    name: string
    fullName: string
    defaultBranch?: string
    githubToken?: string
  }): Promise<Repository> {
    return this.prisma.repository.create({ data })
  }

  async findAll(): Promise<Repository[]> {
    return this.prisma.repository.findMany({ orderBy: { createdAt: 'desc' } })
  }

  async findById(id: string): Promise<Repository | null> {
    return this.prisma.repository.findUnique({ where: { id } })
  }

  async findByFullName(fullName: string): Promise<Repository | null> {
    return this.prisma.repository.findUnique({ where: { fullName } })
  }

  async updateStatus(id: string, status: RepoStatus): Promise<Repository> {
    return this.prisma.repository.update({ where: { id }, data: { status } })
  }

  async updateLastIngested(id: string): Promise<Repository> {
    return this.prisma.repository.update({
      where: { id },
      data: { status: 'READY', lastIngestedAt: new Date() },
    })
  }

  async getStats(id: string) {
    const [fileCount, nodeCount, edgeCount] = await Promise.all([
      this.prisma.file.count({ where: { repositoryId: id } }),
      this.prisma.graphNode.count({ where: { repositoryId: id } }),
      this.prisma.graphEdge.count({
        where: { from: { repositoryId: id } },
      }),
    ])
    return { fileCount, nodeCount, edgeCount }
  }

  async updateToken(id: string, token: string): Promise<Repository> {
    return this.prisma.repository.update({ where: { id }, data: { githubToken: token } })
  }

  async delete(id: string): Promise<void> {
    await this.prisma.repository.delete({ where: { id } })
  }
}
