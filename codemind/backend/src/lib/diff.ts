import type { FileChange } from '@codemind/shared'

export interface MultiFileParsedOutput {
  fileChanges: FileChange[]
  explanation: string
  totalAdditions: number
  totalDeletions: number
}

export function parseMultiFileDiff(claudeResponse: string): MultiFileParsedOutput {
  const explanation = claudeResponse.match(/<explanation>([\s\S]*?)<\/explanation>/)?.[1]?.trim() ?? ''
  const fileBlockRegex = /<file\s+path="([^"]+)"\s+operation="(modify|create)">([\s\S]*?)<\/file>/g
  const fileChanges: FileChange[] = []

  let match: RegExpExecArray | null
  while ((match = fileBlockRegex.exec(claudeResponse)) !== null) {
    const [, path, operation, body] = match
    if (operation === 'modify') {
      const diff = body.match(/<diff>([\s\S]*?)<\/diff>/)?.[1]?.trim() ?? ''
      const lines = diff.split('\n')
      const additions = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length
      const deletions = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length
      fileChanges.push({ path, operation: 'modify', diff, additions, deletions })
    } else {
      const content = body.match(/<content>([\s\S]*?)<\/content>/)?.[1]?.trim() ?? ''
      fileChanges.push({ path, operation: 'create', content, additions: content.split('\n').length, deletions: 0 })
    }
  }

  return {
    fileChanges,
    explanation,
    totalAdditions: fileChanges.reduce((s, f) => s + f.additions, 0),
    totalDeletions: fileChanges.reduce((s, f) => s + f.deletions, 0),
  }
}

export interface ParsedDiff {
  diff: string
  explanation: string
  additions: number
  deletions: number
}

export function parseDiff(claudeResponse: string): ParsedDiff {
  const diffMatch = claudeResponse.match(/<diff>([\s\S]*?)<\/diff>/)
  const explanationMatch = claudeResponse.match(/<explanation>([\s\S]*?)<\/explanation>/)

  const diff = diffMatch?.[1]?.trim() ?? ''
  const explanation = explanationMatch?.[1]?.trim() ?? ''

  const lines = diff.split('\n')
  const additions = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length
  const deletions = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length

  return { diff, explanation, additions, deletions }
}

export function applyDiff(original: string, diff: string): string {
  if (!diff.trim()) return original

  const lines = original.split('\n')
  const diffLines = diff.split('\n')
  const result = [...lines]
  let offset = 0

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i]
    // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (!hunkMatch) continue

    const oldStart = parseInt(hunkMatch[1]) - 1 // 0-indexed
    let pos = oldStart + offset
    i++

    const removals: number[] = []
    const insertions: string[] = []

    while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
      const dl = diffLines[i]
      if (dl.startsWith('-')) {
        removals.push(pos)
        pos++
      } else if (dl.startsWith('+')) {
        insertions.push(dl.slice(1))
      } else {
        // context line
        pos++
      }
      i++
    }
    i-- // will be incremented by for loop

    // Apply removals (in reverse to preserve indices)
    for (const idx of removals.reverse()) {
      result.splice(idx, 1)
      offset--
    }

    // Apply insertions at the right spot
    const insertAt = oldStart + offset
    result.splice(insertAt, 0, ...insertions)
    offset += insertions.length
  }

  return result.join('\n')
}
