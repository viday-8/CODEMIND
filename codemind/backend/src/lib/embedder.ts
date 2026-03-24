import { config } from '../config'
import { logger } from './logger'

// TODO: type — @xenova/transformers doesn't ship official TS types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _embedder: any = null

export async function getEmbedder() {
  if (!_embedder) {
    logger.info(`Loading embedding model: ${config.EMBEDDING_MODEL}`)
    const { pipeline } = await import('@xenova/transformers')
    _embedder = await pipeline('feature-extraction', config.EMBEDDING_MODEL)
    logger.info('Embedding model loaded')
  }
  return _embedder
}

export async function embedText(text: string): Promise<number[]> {
  const embed = await getEmbedder()
  const output = await embed(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data) as number[]
}

export async function embedFile(file: { path: string; content: string }): Promise<number[]> {
  const text = `${file.path}\n${file.content.slice(0, 2000)}`
  return embedText(text)
}
