import { PrismaClient, ChunkType } from '@prisma/client'
import type { RawChunk } from '../services/chunk.service'

export interface ChunkRecord {
  id: string
  path: string
  name: string | null
  chunkType: ChunkType
  startLine: number
  endLine: number
  content: string
  similarity: number
}

export class ChunkRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertChunks(
    repositoryId: string,
    fileId: string,
    path: string,
    chunks: RawChunk[]
  ): Promise<{ id: string; startLine: number; endLine: number }[]> {
    return Promise.all(
      chunks.map((c) =>
        this.prisma.codeChunk.upsert({
          where: { fileId_startLine_endLine: { fileId, startLine: c.startLine, endLine: c.endLine } },
          create: {
            repositoryId,
            fileId,
            path,
            nodeId: c.nodeId,
            chunkType: c.chunkType as ChunkType,
            name: c.name,
            startLine: c.startLine,
            endLine: c.endLine,
            content: c.content,
          },
          update: { content: c.content, nodeId: c.nodeId, name: c.name },
          select: { id: true, startLine: true, endLine: true },
        })
      )
    )
  }

  async updateEmbedding(id: string, embedding: number[]): Promise<void> {
    const vec = `[${embedding.join(',')}]`
    await this.prisma.$executeRaw`UPDATE "CodeChunk" SET embedding = ${vec}::vector WHERE id = ${id}`
  }

  async findSimilar(
    repositoryId: string,
    queryEmbedding: number[],
    limit = 20
  ): Promise<ChunkRecord[]> {
    const vec = `[${queryEmbedding.join(',')}]`
    return this.prisma.$queryRaw<ChunkRecord[]>`
      SELECT id, path, name, "chunkType", "startLine", "endLine", content,
             1 - (embedding <=> ${vec}::vector) AS similarity
      FROM "CodeChunk"
      WHERE "repositoryId" = ${repositoryId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${limit}
    `
  }

  async deleteForRepo(repositoryId: string): Promise<void> {
    await this.prisma.codeChunk.deleteMany({ where: { repositoryId } })
  }
}
