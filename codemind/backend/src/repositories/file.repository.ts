import { PrismaClient, File } from '@prisma/client'
import { Prisma } from '@prisma/client'

export class FileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(data: {
    repositoryId: string
    path: string
    name: string
    ext: string
    content: string
    sizeBytes: number
    sha: string
  }): Promise<File> {
    return this.prisma.file.upsert({
      where: { repositoryId_path: { repositoryId: data.repositoryId, path: data.path } },
      create: data,
      update: { content: data.content, sha: data.sha, sizeBytes: data.sizeBytes },
    })
  }

  async upsertMany(files: Array<{
    repositoryId: string
    path: string
    name: string
    ext: string
    content: string
    sizeBytes: number
    sha: string
  }>): Promise<void> {
    await Promise.all(files.map((f) => this.upsert(f)))
  }

  async findById(id: string): Promise<File | null> {
    return this.prisma.file.findUnique({ where: { id } })
  }

  async findByPath(repositoryId: string, path: string): Promise<File | null> {
    return this.prisma.file.findUnique({
      where: { repositoryId_path: { repositoryId, path } },
    })
  }

  async updateEmbedding(id: string, embedding: number[]): Promise<void> {
    const vec = `[${embedding.join(',')}]`
    await this.prisma.$executeRaw`
      UPDATE "File" SET embedding = ${vec}::vector WHERE id = ${id}`
  }

  async findSimilar(repositoryId: string, queryEmbedding: number[], limit = 6): Promise<Array<File & { similarity: number }>> {
    const vec = `[${queryEmbedding.join(',')}]`
    return this.prisma.$queryRaw<Array<File & { similarity: number }>>`
      SELECT id, "repositoryId" as "repositoryId", path, name, ext, content,
             "sizeBytes", sha, "createdAt", "updatedAt",
             1 - (embedding <=> ${vec}::vector) AS similarity
      FROM "File"
      WHERE "repositoryId" = ${repositoryId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${Prisma.sql`${limit}`}
    `
  }
}
