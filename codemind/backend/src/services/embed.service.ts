import { FileRepository } from '../repositories/file.repository'
import { embedFile } from '../lib/embedder'
import type { FileContent } from '../lib/github'

const BATCH_SIZE = 32

export class EmbedService {
  constructor(private readonly fileRepo: FileRepository) {}

  async embedAll(
    repositoryId: string,
    files: FileContent[],
    onProgress?: (done: number, total: number) => Promise<void>,
  ): Promise<{ embedded: number }> {
    let embedded = 0

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE)

      await Promise.all(batch.map(async (f) => {
        try {
          const fileRecord = await this.fileRepo.findByPath(repositoryId, f.path)
          if (!fileRecord) return

          const vec = await embedFile(f)
          await this.fileRepo.updateEmbedding(fileRecord.id, vec)
          embedded++
        } catch {
          // Skip files that fail to embed
        }
      }))

      if (onProgress) await onProgress(Math.min(i + BATCH_SIZE, files.length), files.length)
    }

    return { embedded }
  }
}
