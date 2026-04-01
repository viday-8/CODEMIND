import { embedText } from '../lib/embedder'
import { ChunkRepository } from '../repositories/chunk.repository'
import type { RawRequirement } from './fdd-extraction.service'
import type { RequirementClassification } from '@prisma/client'

// Tunable similarity thresholds
const EXISTING_THRESHOLD = 0.82
const UPDATE_THRESHOLD   = 0.60

export interface GapResult {
  classification: RequirementClassification
  rationale: string
  topSimilarity: number
}

export async function analyzeRequirement(
  repositoryId: string,
  req: RawRequirement,
  chunkRepo: ChunkRepository,
): Promise<GapResult> {
  const embedding = await embedText(`${req.title}\n${req.description}`)
  const chunks = await chunkRepo.findSimilar(repositoryId, embedding, 5)

  const topSimilarity = chunks.length > 0 ? Number(chunks[0].similarity) : 0
  const topFile = chunks.length > 0 ? chunks[0].path : null

  let classification: RequirementClassification
  let rationale: string

  if (topSimilarity >= EXISTING_THRESHOLD) {
    classification = 'EXISTING'
    rationale = `Already implemented — top match: ${topFile} (${(topSimilarity * 100).toFixed(1)}% similarity)`
  } else if (topSimilarity >= UPDATE_THRESHOLD) {
    classification = 'UPDATE'
    rationale = `Partially implemented — closest match: ${topFile} (${(topSimilarity * 100).toFixed(1)}% similarity). Needs modification.`
  } else {
    classification = 'GAP'
    rationale = topFile
      ? `Not found in codebase — best match was ${topFile} (${(topSimilarity * 100).toFixed(1)}% similarity). Needs to be built.`
      : `No matching code found in codebase. Needs to be built from scratch.`
  }

  return { classification, rationale, topSimilarity }
}
