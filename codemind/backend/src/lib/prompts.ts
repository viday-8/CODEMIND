export const CODING_AGENT_SYSTEM = `You are an expert coding agent embedded in a DevOps platform.
You receive source code from a GitHub repository and a change request.
You MUST generate precise, minimal changes that implement exactly what was requested.
You can modify existing files and create new files.
Never invent code that is not logically consistent with the existing codebase.
Always respond using the exact XML format specified — no other text outside the tags.`

export const REVIEW_AGENT_SYSTEM = `You are a senior software engineer performing a code review.
You receive a task description and a unified diff.
Identify real issues: security vulnerabilities, logic bugs, missing error handling, scope creep, breaking changes.
Do not invent issues. Be concise.
Respond with valid JSON only — no markdown, no explanation outside the JSON.`

export function buildCodingPrompt(ctx: {
  title: string
  description: string
  changeType: string
  candidateFiles: Array<{
    path: string
    ext: string
    content: string
    importers: string[]
    deps: string[]
  }>
  rejectionFeedback?: string
}): string {
  const filesSection = ctx.candidateFiles.map((f) => {
    const graphCtx = [
      f.deps.length     ? `IMPORTS: ${f.deps.join(', ')}` : '',
      f.importers.length ? `IMPORTED BY: ${f.importers.join(', ')}` : '',
    ].filter(Boolean).join('\n')
    return `═══ FILE: ${f.path} ═══
${graphCtx ? graphCtx + '\n' : ''}\`\`\`${f.ext}
${f.content}
\`\`\``
  }).join('\n\n')

  return `TASK: ${ctx.title}
DESCRIPTION: ${ctx.description}
TYPE: ${ctx.changeType}
${ctx.rejectionFeedback ? `\nPREVIOUS ATTEMPT WAS REJECTED:\n${ctx.rejectionFeedback}\nFix the above issues in this attempt.\n` : ''}
${filesSection}

Generate the minimal set of changes to implement the task.
Only touch files that actually need to change.

For each file you MODIFY:
<file path="src/services/foo.ts" operation="modify">
<diff>
--- a/src/services/foo.ts
+++ b/src/services/foo.ts
@@ -LINE,COUNT +LINE,COUNT @@
 context line
-removed line
+added line
</diff>
</file>

For each NEW file you CREATE:
<file path="src/services/bar.ts" operation="create">
<content>
// full file content here
</content>
</file>

<explanation>
What changed, why, and which callers to verify.
</explanation>`
}

export const FDD_EXTRACTION_SYSTEM = `You are a requirements analyst. Extract all functional requirements from the provided document. Return ONLY a JSON object with key "requirements" as an array. Each element must have "title" (string, max 200 chars) and "description" (string, full detail). No markdown, no explanation outside the JSON.`

export function buildFddExtractionPrompt(rawText: string): string {
  return `DOCUMENT TEXT:\n\n${rawText.slice(0, 40000)}`
}

export const FDD_GAP_ANALYSIS_SYSTEM = `You are a software analyst performing gap analysis between a functional requirement and an existing codebase.

Classify the requirement as exactly one of:
- EXISTING: The requirement is already fully implemented in the provided code snippets
- UPDATE: The requirement is partially implemented — relevant code exists but needs modification or extension
- GAP: The requirement is not implemented at all in the provided code

Respond with valid JSON only, no markdown, no extra text:
{"classification": "EXISTING" | "UPDATE" | "GAP", "rationale": "one concise sentence referencing specific files where applicable"}`

export function buildFddGapAnalysisPrompt(
  req: { title: string; description: string },
  chunks: Array<{ path: string; similarity: number; content: string }>,
): string {
  const codeSection = chunks.length === 0
    ? 'No matching code found in the repository.'
    : chunks
        .map((c, i) =>
          `=== [${i + 1}] ${c.path} (${(c.similarity * 100).toFixed(0)}% semantic match) ===\n${c.content.slice(0, 800)}`
        )
        .join('\n\n')

  return `REQUIREMENT:
Title: ${req.title}
Description: ${req.description}

MOST RELEVANT CODE FROM THE CODEBASE:
${codeSection}

Classify this requirement as EXISTING, UPDATE, or GAP based on the code above.`
}

export function buildReviewPrompt(ctx: {
  title: string
  diff: string
  filePath: string
}): string {
  return `Review this code change for task: "${ctx.title}"

FILE: ${ctx.filePath}

DIFF:
${ctx.diff}

Respond with this exact JSON (no other text):
{
  "verdict": "pass" | "warn" | "block",
  "summary": "one concise sentence",
  "comments": [
    { "severity": "info"|"warning"|"blocking", "category": "string", "text": "string" }
  ]
}`
}
