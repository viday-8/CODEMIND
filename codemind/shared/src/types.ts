// Enums
export type Role = 'DEVELOPER' | 'REVIEWER' | 'ADMIN'
export type RepoStatus = 'PENDING' | 'INGESTING' | 'READY' | 'ERROR'
export type JobStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED'
export type NodeType = 'FILE' | 'FUNCTION' | 'CLASS' | 'METHOD' | 'INTERFACE' | 'EXPORT' | 'MODULE'
export type EdgeLabel = 'IMPORTS' | 'DEFINES' | 'EXPORTS' | 'CALLS' | 'EXTENDS' | 'IMPLEMENTS'
export type ChangeType = 'FEATURE' | 'BUG_FIX' | 'REFACTOR' | 'PERFORMANCE' | 'SECURITY' | 'REQUIREMENT'
export type TaskStatus = 'PENDING' | 'AGENT_RUNNING' | 'REVIEW_RUNNING' | 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'PATCHING' | 'DONE' | 'FAILED'
export type AgentType = 'CODING' | 'REVIEW'
export type Verdict = 'PASS' | 'WARN' | 'BLOCK'
export type ApprovalDecision = 'APPROVED' | 'REJECTED'
export type PRStatus = 'OPEN' | 'MERGED' | 'CLOSED'
export type ClaudeModel = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' | 'claude-opus-4-6'

// API Response envelope
export interface ApiResponse<T> {
  data: T | null
  error: { code: string; message: string } | null
  meta: { took: number }
}

// SSE Events
export type IngestEvent =
  | { type: 'progress'; pct: number; label: string }
  | { type: 'log'; message: string; level: 'info' | 'ok' | 'error' }
  | { type: 'done'; stats: { files: number; nodes: number; edges: number; embeddings: number; chunks: number } }
  | { type: 'error'; message: string }

export type AgentEvent =
  | { type: 'step'; step: number; label: string; status: 'active' | 'done' | 'error' }
  | { type: 'log'; message: string; level: 'info' | 'ok' | 'error' }
  | { type: 'context'; files: Array<{ path: string; similarity: number }>; dependents: string[] }
  | { type: 'done'; jobId: string }
  | { type: 'error'; message: string }

export interface ReviewOutput {
  verdict: 'pass' | 'warn' | 'block'
  summary: string
  comments: Array<{
    severity: 'info' | 'warning' | 'blocking'
    category: 'security' | 'correctness' | 'scope' | 'style' | 'tests' | 'performance'
    text: string
    line?: number
  }>
}

// Multi-file change types for coding agent
export type FileOperation = 'modify' | 'create'

export interface FileChange {
  path: string
  operation: FileOperation
  diff?: string         // present for 'modify'
  content?: string      // present for 'create' (full new file content)
  additions: number
  deletions: number
}

export type ChunkType = 'FUNCTION' | 'CLASS' | 'FILE_HEADER' | 'SLIDING'

export interface ChunkMatch {
  id: string
  path: string
  name: string | null
  chunkType: ChunkType
  startLine: number
  endLine: number
  content: string
  similarity: number
}

// FDD types
export type FddStatus = 'UPLOADING' | 'PARSING' | 'EXTRACTING' | 'ANALYZING' | 'READY' | 'FAILED'
export type RequirementClassification = 'GAP' | 'UPDATE' | 'EXISTING'

export interface FddRequirement {
  id: string
  fddId: string
  order: number
  title: string
  description: string
  classification: RequirementClassification | null
  rationale: string | null
  taskId: string | null
}

export interface FunctionalDoc {
  id: string
  repositoryId: string
  fileName: string
  mimeType: string
  status: FddStatus
  errorMessage: string | null
  bullJobId: string | null
  createdAt: string
  requirements: FddRequirement[]
}

// Partial domain types for frontend use
export interface UserPublic {
  id: string
  email: string
  name: string
  role: Role
}

export interface FileMatch {
  id: string
  path: string
  name: string
  ext: string
  similarity: number
}

export interface RepoPreviewFileType {
  ext: string    // e.g. ".ts"
  count: number  // e.g. 45
}

export interface RepoPreview {
  name: string
  fullName: string
  description: string | null
  language: string | null
  stars: number
  defaultBranch: string
  totalFiles: number
  fileTypes: RepoPreviewFileType[]  // sorted desc by count
  scopeMessage: string              // e.g. "Medium repo · 77 source files"
}
