import type { GraphNode } from '@prisma/client'

export interface RawChunk {
  nodeId: string | null
  chunkType: 'FUNCTION' | 'CLASS' | 'FILE_HEADER' | 'SLIDING'
  name: string | null
  startLine: number  // 1-based
  endLine: number
  content: string
}

const SLIDING_WINDOW = 60   // lines per fallback chunk
const SLIDING_OVERLAP = 10  // line overlap between fallback chunks

export function extractChunks(
  fileContent: string,
  nodes: Pick<GraphNode, 'id' | 'nodeType' | 'name' | 'startLine' | 'endLine'>[]
): RawChunk[] {
  const lines = fileContent.split('\n')
  const total = lines.length

  // Always include sliding window chunks — guarantees every line is searchable
  const chunks: RawChunk[] = slidingChunks(lines)

  const symbolNodes = nodes
    .filter((n) => n.nodeType === 'FUNCTION' || n.nodeType === 'CLASS' || n.nodeType === 'METHOD')
    .sort((a, b) => (a.startLine ?? 0) - (b.startLine ?? 0))

  // Additionally create precise symbol-level chunks for named functions / classes
  for (const node of symbolNodes) {
    const start = node.startLine ?? 1
    const end = Math.min(node.endLine ?? start, total)
    if (end - start < 2) continue  // skip single-line stubs (no body tracked)
    chunks.push({
      nodeId: node.id,
      chunkType: node.nodeType === 'CLASS' ? 'CLASS' : 'FUNCTION',
      name: node.name,
      startLine: start,
      endLine: end,
      content: lines.slice(start - 1, end).join('\n'),
    })
  }

  return chunks
}

function slidingChunks(lines: string[]): RawChunk[] {
  const chunks: RawChunk[] = []
  let start = 0
  while (start < lines.length) {
    const end = Math.min(start + SLIDING_WINDOW, lines.length)
    chunks.push({
      nodeId: null,
      chunkType: 'SLIDING',
      name: null,
      startLine: start + 1,
      endLine: end,
      content: lines.slice(start, end).join('\n'),
    })
    start += SLIDING_WINDOW - SLIDING_OVERLAP
    if (start >= lines.length) break
  }
  return chunks
}
