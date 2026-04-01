import { embedText } from '../lib/embedder'
import { callClaude } from '../lib/claude'
import { ChunkRepository } from '../repositories/chunk.repository'
import { buildFddGapAnalysisPrompt, FDD_GAP_ANALYSIS_SYSTEM } from '../lib/prompts'
import type { RawRequirement } from './fdd-extraction.service'
import type { RequirementClassification } from '@prisma/client'

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
  // Step 1: embed the requirement text and retrieve the most similar code chunks
  const embedding = await embedText(`${req.title}\n${req.description}`)
  const chunks = await chunkRepo.findSimilar(repositoryId, embedding, 5)

  const topSimilarity = chunks.length > 0 ? Number(chunks[0].similarity) : 0

  // Step 2: if no code is indexed for this repo, it's definitely a GAP
  if (chunks.length === 0) {
    return {
      classification: 'GAP',
      rationale: 'No code indexed for this repository — requirement needs to be built from scratch.',
      topSimilarity: 0,
    }
  }

  // Step 3: ask Claude to classify the requirement against the retrieved code context.
  // Vector search finds semantically similar code; Claude decides if it's actually implemented.
  const prompt = buildFddGapAnalysisPrompt(req, chunks)

  try {
    const result = await callClaude(prompt, FDD_GAP_ANALYSIS_SYSTEM, 512, 'claude-haiku-4-5-20251001')
    const cleaned = result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned)

    const classification: RequirementClassification =
      parsed.classification === 'EXISTING' ? 'EXISTING'
      : parsed.classification === 'UPDATE'   ? 'UPDATE'
      : 'GAP'

    const rationale =
      typeof parsed.rationale === 'string' && parsed.rationale.length > 0
        ? parsed.rationale
        : fallbackRationale(classification, chunks[0].path, topSimilarity)

    return { classification, rationale, topSimilarity }
  } catch {
    // Claude call or JSON parse failed — fall back to similarity thresholds
    const classification: RequirementClassification =
      topSimilarity >= 0.75 ? 'EXISTING' : topSimilarity >= 0.50 ? 'UPDATE' : 'GAP'
    return {
      classification,
      rationale: fallbackRationale(classification, chunks[0].path, topSimilarity),
      topSimilarity,
    }
  }
}

function fallbackRationale(
  cls: RequirementClassification,
  topFile: string,
  score: number,
): string {
  const pct = (score * 100).toFixed(1)
  if (cls === 'EXISTING') return `Already implemented — top match: ${topFile} (${pct}% similarity)`
  if (cls === 'UPDATE')   return `Partially implemented — closest match: ${topFile} (${pct}% similarity). Needs modification.`
  return topFile
    ? `Not found in codebase — best match was ${topFile} (${pct}% similarity). Needs to be built.`
    : 'No matching code found in codebase. Needs to be built from scratch.'
}
