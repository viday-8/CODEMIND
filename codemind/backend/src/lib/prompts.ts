export const CODING_AGENT_SYSTEM = `You are an expert coding agent embedded in a DevOps platform.
You receive real source code from a GitHub repository and a change request.
You MUST generate a minimal, precise unified diff that implements exactly what was requested.
Your diff must reference real line numbers and real code from the files provided.
Never invent code that is not logically consistent with the existing codebase.
Always use <diff> and <explanation> tags in your response.`

export const REVIEW_AGENT_SYSTEM = `You are a senior software engineer performing a code review.
You receive a task description and a unified diff.
Identify real issues: security vulnerabilities, logic bugs, missing error handling, scope creep, breaking changes.
Do not invent issues. Be concise.
Respond with valid JSON only — no markdown, no explanation outside the JSON.`

export function buildCodingPrompt(ctx: {
  title: string
  description: string
  changeType: string
  primaryFile: { path: string; ext: string; content: string }
  relatedFiles: Array<{ path: string; ext: string; content: string }>
  importers: string[]
  deps: string[]
  entities: string[]
  rejectionFeedback?: string
}): string {
  return `TASK: ${ctx.title}
DESCRIPTION: ${ctx.description}
TYPE: ${ctx.changeType}
${ctx.rejectionFeedback ? `\nPREVIOUS ATTEMPT WAS REJECTED:\n${ctx.rejectionFeedback}\nFix the above issues in this attempt.\n` : ''}
═══ PRIMARY FILE: ${ctx.primaryFile.path} ═══
\`\`\`${ctx.primaryFile.ext}
${ctx.primaryFile.content}
\`\`\`
${ctx.entities.length ? `\nDEFINED: ${ctx.entities.join(', ')}` : ''}
${ctx.importers.length ? `\nIMPORTED BY: ${ctx.importers.join(', ')}` : ''}
${ctx.deps.length ? `\nIMPORTS: ${ctx.deps.join(', ')}` : ''}
${ctx.relatedFiles.length
  ? '\n═══ RELATED FILES ═══\n' + ctx.relatedFiles.map((f) =>
    `// ${f.path}\n\`\`\`${f.ext}\n${f.content.slice(0, 800)}\n\`\`\``,
  ).join('\n\n')
  : ''}

Generate a minimal unified diff. Respond with EXACTLY:
<diff>
--- a/${ctx.primaryFile.path}
+++ b/${ctx.primaryFile.path}
@@ -LINE,COUNT +LINE,COUNT @@
 context line
-removed line
+added line
</diff>
<explanation>
What changed, why, and which dependents to verify.
</explanation>`
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
