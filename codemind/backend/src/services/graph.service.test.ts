import { describe, it, expect, vi } from 'vitest'

// Prisma enums are not available without a generated client; stub them for tests
vi.mock('@prisma/client', () => ({
  NodeType: { FILE: 'FILE', FUNCTION: 'FUNCTION', CLASS: 'CLASS' },
  PrismaClient: vi.fn(),
}))

import { GraphService } from './graph.service'
import { GraphRepository } from '../repositories/graph.repository'
import { FileRepository } from '../repositories/file.repository'
import type { ParsedFile } from '../lib/parser'

const FAKE_FILE_RECORD = { id: 'file-1', repositoryId: 'repo-1', path: 'src/utils.ts' }
const FAKE_FILE_RECORD_2 = { id: 'file-2', repositoryId: 'repo-1', path: 'src/index.ts' }

function makeGraphRepo(overrides = {}): GraphRepository {
  return {
    deleteForRepo: vi.fn().mockResolvedValue(undefined),
    upsertNodes:   vi.fn().mockResolvedValue(['node-1']),
    createEdges:   vi.fn().mockResolvedValue(undefined),
    findEdgesFrom: vi.fn().mockResolvedValue([]),
    findEdgesTo:   vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as GraphRepository
}

function makeFileRepo(overrides = {}): FileRepository {
  return {
    upsert:          vi.fn().mockResolvedValue(FAKE_FILE_RECORD),
    findByPath:      vi.fn().mockResolvedValue(FAKE_FILE_RECORD),
    updateEmbedding: vi.fn(),
    findSimilar:     vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as FileRepository
}

const PARSED_FILE: ParsedFile = {
  path: 'src/utils.ts',
  content: 'export function add(a, b) { return a + b }',
  sizeBytes: 42,
  sha: 'abc123',
  imports: [],
  exports: ['add'],
  functions: [{ name: 'add', startLine: 1, endLine: 1 }],
  classes: [],
}

const PARSED_FILE_WITH_IMPORT: ParsedFile = {
  path: 'src/index.ts',
  content: "import { add } from './utils.ts'",
  sizeBytes: 31,
  sha: 'def456',
  imports: [{ name: 'add', from: './utils.ts' }],
  exports: [],
  functions: [],
  classes: [],
}

describe('GraphService.buildGraph', () => {
  it('happy path — creates file + function nodes and returns counts', async () => {
    const graphRepo = makeGraphRepo()
    const fileRepo  = makeFileRepo()
    const svc = new GraphService(graphRepo, fileRepo)

    const result = await svc.buildGraph('repo-1', [PARSED_FILE])

    expect(graphRepo.deleteForRepo).toHaveBeenCalledWith('repo-1')
    expect(fileRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({ path: 'src/utils.ts' }))
    // 1 FILE node + 1 FUNCTION node
    expect(result.nodes).toBe(2)
    expect(result.edges).toBe(0)
  })

  it('happy path — resolves relative import and creates IMPORTS edge', async () => {
    const graphRepo = makeGraphRepo({
      upsertNodes: vi.fn()
        .mockResolvedValueOnce(['node-1'])  // utils.ts FILE node
        .mockResolvedValue(['node-2']),      // index.ts FILE node (and any extras)
    })
    const fileRepo = makeFileRepo({
      findByPath: vi.fn()
        .mockResolvedValueOnce(FAKE_FILE_RECORD)    // lookup for utils.ts
        .mockResolvedValueOnce(FAKE_FILE_RECORD_2), // lookup for index.ts
    })
    const svc = new GraphService(graphRepo, fileRepo)

    const result = await svc.buildGraph('repo-1', [PARSED_FILE, PARSED_FILE_WITH_IMPORT])

    expect(graphRepo.createEdges).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ label: 'IMPORTS' })]),
    )
    expect(result.edges).toBe(1)
  })

  it('error path — skips files where DB record is not found', async () => {
    const graphRepo = makeGraphRepo()
    const fileRepo  = makeFileRepo({
      findByPath: vi.fn().mockResolvedValue(null), // simulates race / missing record
    })
    const svc = new GraphService(graphRepo, fileRepo)

    const result = await svc.buildGraph('repo-1', [PARSED_FILE])

    // No nodes created because findByPath returned null → continue
    expect(result.nodes).toBe(0)
    expect(result.edges).toBe(0)
  })

  it('happy path — works without a fileRepo (graph-only mode)', async () => {
    const graphRepo = makeGraphRepo()
    // No fileRepo → upsertNodes never called (findByPath returns undefined)
    const svc = new GraphService(graphRepo)

    const result = await svc.buildGraph('repo-1', [PARSED_FILE])

    expect(result.nodes).toBe(0) // skipped because no fileRecord
    expect(graphRepo.deleteForRepo).toHaveBeenCalledWith('repo-1')
  })
})
