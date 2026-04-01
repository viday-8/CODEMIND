import { callClaude } from '../lib/claude'
import { FDD_EXTRACTION_SYSTEM, buildFddExtractionPrompt } from '../lib/prompts'
import { AppError } from '../middleware/error'

export interface RawRequirement {
  title: string
  description: string
}

function parseResponse(text: string): RawRequirement[] {
  // Strip markdown code fences if Claude wraps JSON in them
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const parsed = JSON.parse(cleaned)
  if (!Array.isArray(parsed.requirements)) {
    throw new Error('Response missing "requirements" array')
  }
  return parsed.requirements.map((r: { title: unknown; description: unknown }, i: number) => {
    if (typeof r.title !== 'string' || typeof r.description !== 'string') {
      throw new Error(`Requirement at index ${i} missing title or description`)
    }
    return { title: r.title.slice(0, 200), description: r.description }
  })
}

export async function extractRequirements(rawText: string): Promise<RawRequirement[]> {
  const prompt = buildFddExtractionPrompt(rawText)

  let text: string
  try {
    const result = await callClaude(prompt, FDD_EXTRACTION_SYSTEM, 4096)
    text = result.text
  } catch (err) {
    throw new AppError('FDD_EXTRACTION_FAILED', `Claude call failed: ${(err as Error).message}`, 500)
  }

  try {
    return parseResponse(text)
  } catch {
    // Retry once with a stricter prompt nudge
    const retryPrompt = buildFddExtractionPrompt(rawText) + '\n\nIMPORTANT: Return ONLY raw JSON. No markdown fences. No explanation.'
    const retryResult = await callClaude(retryPrompt, FDD_EXTRACTION_SYSTEM, 4096)
    try {
      return parseResponse(retryResult.text)
    } catch (parseErr) {
      throw new AppError('FDD_EXTRACTION_FAILED', `Could not parse requirements JSON: ${(parseErr as Error).message}`, 500)
    }
  }
}
