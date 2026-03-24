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
