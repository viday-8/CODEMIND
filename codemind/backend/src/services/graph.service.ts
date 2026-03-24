import { NodeType } from '@prisma/client'
import { GraphRepository } from '../repositories/graph.repository'
import { FileRepository } from '../repositories/file.repository'
import type { ParsedFile } from '../lib/parser'
import type { FileContent } from '../lib/github'

export class GraphService {
  constructor(
    private readonly graphRepo: GraphRepository,
    private readonly fileRepo?: FileRepository,
  ) {}

  async buildGraph(
    repositoryId: string,
    parsedFiles: ParsedFile[],
  ): Promise<{ nodes: number; edges: number }> {
    // Clear existing graph for re-ingest
    await this.graphRepo.deleteForRepo(repositoryId)

    let totalNodes = 0
    let totalEdges = 0

    // First pass: upsert all files to DB and build nodes
    const fileNodeMap = new Map<string, string>() // path → nodeId

    for (const file of parsedFiles) {
      // Upsert file record
      if (this.fileRepo) {
        const ext = '.' + file.path.split('.').pop()?.toLowerCase()
        const name = file.path.split('/').pop() ?? file.path
        await this.fileRepo.upsert({
          repositoryId,
          path: file.path,
          name,
          ext,
          content: file.content,
          sizeBytes: file.sizeBytes,
          sha: file.sha,
        })
      }

      // Create file-level node
      const fileRecord = await this.fileRepo?.findByPath(repositoryId, file.path)
      if (!fileRecord) continue

      const [fileNode] = await this.graphRepo.upsertNodes([{
        repositoryId,
        fileId: fileRecord.id,
        nodeType: NodeType.FILE,
        name: file.path.split('/').pop() ?? file.path,
        fullName: file.path,
        startLine: 1,
        endLine: file.content.split('\n').length,
      }])
      fileNodeMap.set(file.path, fileNode)
      totalNodes++

      // Function nodes + DEFINES edges
      for (const fn of file.functions) {
        const [fnNodeId] = await this.graphRepo.upsertNodes([{
          repositoryId,
          fileId: fileRecord.id,
          nodeType: NodeType.FUNCTION,
          name: fn.name,
          fullName: `${file.path}::${fn.name}`,
          startLine: fn.startLine,
          endLine: fn.endLine,
        }])
        await this.graphRepo.createEdges([{ fromId: fileNode, toId: fnNodeId, label: 'DEFINES' }])
        totalNodes++
        totalEdges++
      }

      // Class nodes + DEFINES edges
      for (const cls of file.classes) {
        const [clsNodeId] = await this.graphRepo.upsertNodes([{
          repositoryId,
          fileId: fileRecord.id,
          nodeType: NodeType.CLASS,
          name: cls.name,
          fullName: `${file.path}::${cls.name}`,
          startLine: cls.startLine,
          endLine: cls.endLine,
        }])
        await this.graphRepo.createEdges([{ fromId: fileNode, toId: clsNodeId, label: 'DEFINES' }])
        totalNodes++
        totalEdges++
      }
    }

    // Second pass: resolve import edges
    for (const file of parsedFiles) {
      const fromId = fileNodeMap.get(file.path)
      if (!fromId) continue

      for (const imp of file.imports) {
        // Resolve relative import to full path
        const resolved = this.resolveImport(file.path, imp.from, fileNodeMap)
        const toId = resolved ? fileNodeMap.get(resolved) : undefined

        if (toId && toId !== fromId) {
          await this.graphRepo.createEdges([{ fromId, toId, label: 'IMPORTS' }])
          totalEdges++
        }
      }
    }

    return { nodes: totalNodes, edges: totalEdges }
  }

  private resolveImport(fromPath: string, importFrom: string, fileNodeMap: Map<string, string>): string | null {
    if (!importFrom.startsWith('.')) return null // external module

    const fromDir = fromPath.split('/').slice(0, -1).join('/')
    const parts = `${fromDir}/${importFrom}`.split('/')
    const resolved: string[] = []

    for (const part of parts) {
      if (part === '..') resolved.pop()
      else if (part !== '.') resolved.push(part)
    }

    const base = resolved.join('/')

    // Try candidates in order, returning the first that exists in the graph
    const candidates = [
      base,
      `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`,
      `${base}.mjs`, `${base}.cjs`,
      `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`, `${base}/index.jsx`,
    ]

    for (const candidate of candidates) {
      if (fileNodeMap.has(candidate)) return candidate
    }
    return null
  }
}
