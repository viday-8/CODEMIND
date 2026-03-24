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
  | { type: 'done'; stats: { files: number; nodes: number; edges: number; embeddings: number } }
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
