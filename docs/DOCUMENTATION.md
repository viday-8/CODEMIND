# CodeMind — Technical Design & Implementation Guide

**Stack:** React · Node.js · PostgreSQL + pgvector · Redis · BullMQ · Claude Sonnet

---

## 1. System Overview

```
Developer → Dashboard → Request Change (plain English)
                ↓
         [Vector Search + Knowledge Graph]
                ↓
         Coding Agent (Claude) → unified diff
                ↓
         Review Agent (Claude) → pass / warn / block
                ↓
         Human Approval UI
          ↙          ↘
   Approve            Reject + reason
      ↓                    ↓
  Patch Engine      Coding Agent (retry with feedback)
      ↓
  GitHub PR created
```

Every long-running operation is a BullMQ job. Frontend subscribes via SSE for real-time progress.

---

## 2. Architecture

```
Frontend (React + Vite)
  Connect | Graph | Request | Approval
          ↕ HTTP + SSE
Backend (Express + TypeScript)
  Routes → Services → Repositories → Prisma
  Queue Manager (BullMQ): ingest | agent | patch
          ↕
  PostgreSQL+pgvector | Redis | GitHub API
```

---

## 3. Database Schema (Prisma)

```prisma
generator client { provider = "prisma-client-js"; previewFeatures = ["postgresqlExtensions"] }
datasource db { provider = "postgresql"; url = env("DATABASE_URL"); extensions = [pgvector(map: "vector")] }

model User { id String @id @default(cuid()); email String @unique; name String; passwordHash String; role Role @default(DEVELOPER); tasks Task[]; approvals Approval[] }
enum Role { DEVELOPER REVIEWER ADMIN }

model Repository { id String @id; owner String; name String; fullName String @unique; defaultBranch String @default("main"); githubToken String?; status RepoStatus @default(PENDING); lastIngestedAt DateTime?; files File[]; tasks Task[]; ingestJobs IngestJob[] }
enum RepoStatus { PENDING INGESTING READY ERROR }

model IngestJob { id String @id; repositoryId String; repository Repository @relation(...); status JobStatus @default(QUEUED); progress Int @default(0); log String[]; startedAt DateTime?; completedAt DateTime?; errorMessage String? }
enum JobStatus { QUEUED RUNNING DONE FAILED }

model File { id String @id; repositoryId String; path String; name String; ext String; content String; sizeBytes Int; sha String; embedding Unsupported("vector(384)")?; nodes GraphNode[]; @@unique([repositoryId, path]) }

model GraphNode { id String @id; repositoryId String; fileId String; file File @relation(...); nodeType NodeType; name String; fullName String; startLine Int; endLine Int; outEdges GraphEdge[] @relation("EdgeFrom"); inEdges GraphEdge[] @relation("EdgeTo") }
enum NodeType { FILE FUNCTION CLASS METHOD INTERFACE EXPORT MODULE }

model GraphEdge { id String @id; fromId String; toId String; label EdgeLabel; from GraphNode @relation("EdgeFrom",...); to GraphNode @relation("EdgeTo",...) }
enum EdgeLabel { IMPORTS DEFINES EXPORTS CALLS EXTENDS IMPLEMENTS }

model Task { id String @id; repositoryId String; requesterId String; title String; description String; changeType ChangeType; status TaskStatus @default(PENDING); attempt Int @default(1); agentJobs AgentJob[]; approval Approval? }
enum ChangeType { FEATURE BUG_FIX REFACTOR PERFORMANCE SECURITY REQUIREMENT }
enum TaskStatus { PENDING AGENT_RUNNING REVIEW_RUNNING AWAITING_APPROVAL APPROVED REJECTED PATCHING DONE FAILED }

model AgentJob { id String @id; taskId String; attempt Int @default(1); agentType AgentType; status JobStatus @default(QUEUED); primaryFilePath String?; diffRaw String?; patchedContent String?; explanation String?; verdict Verdict?; reviewSummary String?; reviewComments Json?; rejectionReason String?; log String[]; tokenCount Int?; durationMs Int? }
enum AgentType { CODING REVIEW }
enum Verdict   { PASS WARN BLOCK }

model Approval { id String @id; taskId String @unique; reviewerId String; decision ApprovalDecision; reason String? }
enum ApprovalDecision { APPROVED REJECTED }

model PullRequest { id String @id; taskId String @unique; repoFullName String; prNumber Int; branchName String; prUrl String; title String; status PRStatus @default(OPEN) }
enum PRStatus { OPEN MERGED CLOSED }
```

**First migration:** prepend `CREATE EXTENSION IF NOT EXISTS vector;`

---

## 4. Phase 1 — Repo Ingest, Knowledge Graph, Embeddings

### IngestWorker steps (0–100%)
1. `[0–10]` Resolve repo metadata (GitHub API)
2. `[10–20]` Fetch file tree (git/trees recursive)
3. `[20–25]` Filter: code extensions, skip node_modules/dist
4. `[25–60]` Fetch file contents (batches of 10)
5. `[60–70]` Parse AST with tree-sitter (JS/TS/JSX/TSX/Python/Java/Go)
6. `[70–80]` Build knowledge graph nodes + edges
7. `[80–95]` Generate embeddings (all-MiniLM-L6-v2, 384-dim, batch 32)
8. `[95–100]` Upsert to PostgreSQL via Prisma

### Key implementations

**Embedder** (`backend/src/lib/embedder.ts`):
```typescript
import { pipeline } from '@xenova/transformers'
let embedder: any = null
export async function getEmbedder() {
  if (!embedder) embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  return embedder
}
export async function embedFile(file: { path: string; content: string }): Promise<number[]> {
  const text = `${file.path}\n${file.content.slice(0, 2000)}`
  const output = await (await getEmbedder())(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data) as number[]
}
```

**Vector Search** (`FileRepository.findSimilar`):
```typescript
async findSimilar(repositoryId: string, queryEmbedding: number[], limit = 6) {
  const vec = `[${queryEmbedding.join(',')}]`
  return this.prisma.$queryRaw<File[]>`
    SELECT id, path, name, ext, content,
           1 - (embedding <=> ${vec}::vector) AS similarity
    FROM "File"
    WHERE "repository_id" = ${repositoryId} AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vec}::vector LIMIT ${limit}`
}
```

### SSE Events
```typescript
type IngestEvent =
  | { type: 'progress'; pct: number; label: string }
  | { type: 'log';      message: string; level: 'info' | 'ok' | 'error' }
  | { type: 'done';     stats: { files: number; nodes: number; edges: number; embeddings: number } }
  | { type: 'error';    message: string }
```

---

## 5. Phase 2 — Request Dashboard

**API endpoints:**
```
GET  /api/repos                    → list repositories
POST /api/repos                    → connect new repo
GET  /api/repos/:id                → repo detail + stats
POST /api/repos/:id/ingest         → trigger ingest
GET  /api/repos/:id/search?q=      → vector search (live preview)
GET  /api/repos/:id/graph          → graph nodes + edges (paginated)
POST /api/tasks                    → create task
GET  /api/tasks?repoId=&status=    → list tasks
GET  /api/tasks/:id                → task detail
```

**Frontend features:** repo selector, request form (title + description + change type chips), live file preview (debounced 400ms vector search), task history list.

---

## 6. Phase 3 — Coding Agent

### AgentWorker steps
1. Vector search: embed (title + description), find top 6 files
2. Graph traversal: fetch IMPORTS/IMPORTED_BY edges (depth 1)
3. Re-fetch top files from raw.githubusercontent.com
4. Build Claude prompt: primary file + 3 related (800 chars each) + graph context
5. Call `claude-sonnet-4-5`, max 4096 tokens → unified diff
6. Parse + validate diff; apply to get patchedContent
7. Save AgentJob; auto-queue review job

### Prompt templates (`backend/src/lib/prompts.ts`)

```typescript
export const CODING_AGENT_SYSTEM = `You are an expert coding agent. Generate a minimal, precise
unified diff referencing real line numbers. Use <diff> and <explanation> tags.`

export const REVIEW_AGENT_SYSTEM = `You are a senior engineer doing code review. Identify real issues:
security, logic bugs, scope creep. Respond with valid JSON only — no markdown.`
```

### Claude API (`backend/src/lib/claude.ts`)
```typescript
import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function callClaude(userMessage: string, systemMessage: string, maxTokens = 4096) {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5', max_tokens: maxTokens,
    system: systemMessage, messages: [{ role: 'user', content: userMessage }]
  })
  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  return { text, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens }
}
```

---

## 7. Phase 4 — Review Agent

### ReviewWorker steps
1. Load AgentJob (coding output)
2. Local heuristics: `console.log` → warn, hardcoded secrets → block, diff > 200 lines → warn
3. Claude AI review: task + diff → structured JSON verdict
4. Merge heuristic + AI comments; determine final verdict
5. Save verdict; emit SSE; set Task.status = AWAITING_APPROVAL

```typescript
interface ReviewOutput {
  verdict: 'pass' | 'warn' | 'block'
  summary: string
  comments: Array<{ severity: 'info'|'warning'|'blocking'; category: string; text: string; line?: number }>
}
```

---

## 8. Phase 5 — Human Approval

**API:**
```
GET  /api/tasks/:id/approval  → task + latestAgentJob + review data
POST /api/tasks/:id/approve   → create Approval, queue patch job
POST /api/tasks/:id/reject    → create Approval, bump attempt, re-queue agent
```

**UI layout:** diff viewer (left) + verdict/comments/explanation panel (right), approve/reject buttons top and bottom. Rejection opens textarea modal.

---

## 9. Phase 6 — PR Creation & Rejection Loop

### PatchWorker steps
1. Load task + approved AgentJob
2. Get current file SHA from GitHub
3. Create branch `refs/heads/ai/{slug}` from base HEAD
4. Commit patched content to branch
5. Open Pull Request via Octokit
6. Post review comments on PR
7. Save PullRequest record; Task.status = DONE

### Rejection Loop
```
POST /api/tasks/:id/reject { reason }
  → Approval { REJECTED, reason }
  → Task.attempt += 1 (max 5 — then Task.status = FAILED)
  → New AgentJob with rejectionReason
  → Re-queue agent-queue with feedback
```

---

## 10. User Stories (summary)

| ID | As a | I want to | So that |
|---|---|---|---|
| US-01 | Developer | Connect a GitHub repo | Platform can analyse code |
| US-02 | Developer | View knowledge graph | Understand dependencies |
| US-03 | Developer | Submit change in plain English | AI identifies files & generates diff |
| US-04 | Developer | Watch agent pipeline live | Diagnose issues in real time |
| US-05 | Reviewer | Inspect diff + review verdict | Ensure quality before GitHub |
| US-06 | Developer | See created PR link + summary | Share with team |
| US-07 | Developer | See task history | Track ongoing/completed changes |
| US-08 | User | Log in with email/password | Requests tracked, access controlled |

---

## 11. Implementation Subtasks

### Phase 1
- P1-01: Monorepo scaffold (Express + Prisma + Vite + Zod config) — done when `GET /api/health` → 200
- P1-02: JWT auth (register, login, refresh, authMiddleware)
- P1-03: Repository model + GitHub connection endpoint
- P1-04: BullMQ + Redis setup, SSE job stream endpoint
- P1-05: GitHub file fetching (tree + content + raw fallback)
- P1-06: tree-sitter AST parsing (JS/TS/Python/Java/Go)
- P1-07: Knowledge graph builder (GraphNode + GraphEdge, resolve imports)
- P1-08: pgvector embeddings + vector search query

### Phase 2
- P2-01: Search + task creation API
- P2-02: Frontend scaffold (routing, Zustand, Axios interceptor, TanStack Query)
- P2-03: Connect repository UI + SSE progress
- P2-04: Graph visualisation (force-directed canvas, D3-force)
- P2-05: Request form UI + live file preview

### Phase 3
- P3-01: AgentWorker skeleton (vector search + graph traversal)
- P3-02: Live file fetch + prompt builder
- P3-03: Claude integration + diff parsing + apply
- P3-04: Agent SSE events + AgentPage UI

### Phase 4
- P4-01: ReviewWorker local heuristics
- P4-02: ReviewWorker Claude AI review + verdict merge

### Phase 5
- P5-01: Approval API (approve + reject endpoints)
- P5-02: ApprovalPage UI (diff viewer + rejection modal)

### Phase 6
- P6-01: PatchWorker — GitHub branch + commit + PR creation
- P6-02: Patch script fallback download
- P6-03: Rejection loop + retry limit (max 5)
- P6-04: OutputPage + audit log timeline

---

## 12. API Reference

All responses: `{ "data": <payload|null>, "error": <{code,message}|null>, "meta": { "took": 42 } }`

### Auth
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/auth/register` | `{ email, name, password }` | `{ user, token }` |
| POST | `/api/auth/login` | `{ email, password }` | `{ user, token }` |
| GET  | `/api/auth/me` | — | `{ user }` |

### Repositories
| Method | Path | Response |
|---|---|---|
| GET  | `/api/repos` | `Repository[]` |
| POST | `/api/repos` | `Repository` |
| GET  | `/api/repos/:id` | `Repository + stats` |
| POST | `/api/repos/:id/ingest` | `{ jobId }` |
| GET  | `/api/repos/:id/search?q=` | `FileMatch[]` |
| GET  | `/api/repos/:id/graph` | `{ nodes, edges }` |

### Tasks
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/tasks` | `{ repositoryId, title, description, changeType }` | `Task` |
| GET  | `/api/tasks?repoId=` | — | `Task[]` |
| GET  | `/api/tasks/:id` | — | `TaskDetail` |
| GET  | `/api/tasks/:id/approval` | — | `ApprovalDetail` |
| POST | `/api/tasks/:id/approve` | — | `{ prJobId }` |
| POST | `/api/tasks/:id/reject` | `{ reason }` | `{ agentJobId }` |
| GET  | `/api/tasks/:id/patch-script` | — | `.sh file` |

### Jobs (SSE)
| Method | Path | Response |
|---|---|---|
| GET | `/api/jobs/:jobId/stream` | `text/event-stream` |
| GET | `/api/jobs/:jobId` | `JobStatus` |

SSE format: `data: {"type":"progress","pct":42,"label":"Parsing AST..."}`

---

## 13. Setup & Local Dev

### Prerequisites
- Node.js 20+, PostgreSQL 15+ with pgvector, Redis 7+
- GitHub PAT (repo scope), Anthropic API key

```bash
git clone https://github.com/your-org/codemind && cd codemind
npm install
createdb codemind
psql codemind -c "CREATE EXTENSION IF NOT EXISTS vector;"
cp backend/.env.example backend/.env   # fill DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY, JWT_SECRET
cp frontend/.env.example frontend/.env
cd backend && npx prisma migrate dev --name init
npm run dev   # starts backend (4000) + frontend (5173) + workers
```

### pgvector setup
```sql
-- After first embed batch, create index:
CREATE INDEX ON "File" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

---

## 14. Progress Tracker

Maintained at `docs/PROGRESS.md`. Update at end of every Claude Code session.

```markdown
## Current Phase: [P1–P6]
## Completed: - [x] P1-01 ...
## In Progress: ...
## Blocked: ...
## Last Session Notes: ...
```
