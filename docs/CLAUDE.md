# CLAUDE.md — CodeMind AI DevOps Platform

> Read at session start. Follow every instruction before writing code.

## Project Identity

**CodeMind** — AI agentic platform: GitHub repo → knowledge graph + embeddings → plain-English change requests → multi-agent pipeline (Coding → Review → Human Approval) → GitHub PRs.

```
codemind/
├── frontend/   # React 18 + Vite + Tailwind
├── backend/    # Node.js 20 + Express
├── workers/    # BullMQ background workers
├── shared/     # Shared TypeScript types
├── docs/       # Architecture & API docs
└── scripts/    # DB migrations, seed scripts
```

---

## Non-Negotiable Rules

1. Never hallucinate library APIs.
2. Every backend route calls a service function — no business logic in routes.
3. Every DB query goes through a repository class — no raw Prisma in services.
4. Every async operation wrapped in try/catch; errors passed to `next(err)`.
5. TypeScript strict mode — no `any` without `// TODO: type`.
6. No secrets in code — all via `process.env`, validated in `config.ts`.
7. Write tests alongside features: 1 happy-path + 1 error-path per service method.
8. Keep functions under 40 lines — extract helpers if longer.
9. One feature per PR — never mix refactors with feature work.
10. pgvector is the only vector store.

---

## Tech Stack (locked)

| Layer | Library | Version |
|---|---|---|
| Frontend | React | 18.x |
| Build | Vite | 5.x |
| Styling | Tailwind CSS | 3.x |
| State | Zustand | 4.x |
| Data fetching | TanStack Query | 5.x |
| HTTP client | Axios | 1.x |
| Diff viewer | react-diff-viewer-continued | 4.x |
| Syntax highlight | Prism.js | 1.x |
| Backend | Express | 4.x |
| Language | TypeScript | 5.x |
| ORM | Prisma | 5.x |
| Vector DB | pgvector | 0.7.x |
| Queue | BullMQ | 5.x |
| Cache | Redis 7.x via ioredis | — |
| AST parser | tree-sitter | 0.22.x |
| Embeddings | @xenova/transformers | 2.x |
| GitHub API | @octokit/rest | 20.x |
| Auth | jsonwebtoken + bcryptjs | — |
| Validation | Zod | 3.x |
| Testing | Vitest + Supertest | — |
| Logging | Pino | 8.x |

---

## Architecture Rules

### Frontend structure
```
src/
├── api/        # Axios + TanStack Query hooks (one file per domain)
├── components/ # Shared: Button, Card, Badge, CodeBlock, DiffViewer
├── features/   # connect/ graph/ request/ agent/ approval/ output/
├── store/      # Zustand stores (one per domain)
├── types/      # TS types (import from shared/ via alias)
└── utils/      # Pure functions only
```
- `React.FC<Props>` for all components. Co-locate `*.test.tsx`.
- No `fetch`/`axios` in components — use hooks from `src/api/`.
- No `useEffect` for data fetching — use TanStack Query.

### Backend structure
```
src/
├── routes/       # Thin Express routers
├── services/     # Business logic classes
├── repositories/ # Prisma DB access classes
├── workers/      # BullMQ job processors
├── middleware/   # auth, error, logging, validate
├── lib/          # Singletons: prisma, redis, octokit, queue
├── config.ts     # Zod env validation
└── index.ts      # App bootstrap
```

### Queue Architecture
```
ingest-queue  → IngestWorker  (clone, parse AST, build graph, embed)
agent-queue   → AgentWorker   (vector search + LLM diff)
review-queue  → ReviewWorker  (validate diff)
patch-queue   → PatchWorker   (apply diff, create branch, open PR)
```
All queues: 3 retries with exponential backoff, dead letter queue, SSE progress.

---

## Environment Variables

```env
# Backend
DATABASE_URL=postgresql://user:pass@localhost:5432/codemind
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_APP_ID=        # Optional (preferred over PAT)
GITHUB_APP_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=
JWT_SECRET=           # Min 32 chars
JWT_EXPIRES_IN=7d
PORT=4000
NODE_ENV=development
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2

# Frontend
VITE_API_URL=http://localhost:4000
VITE_WS_URL=ws://localhost:4000
```

---

## Feature Build Order

1. Schema → prisma migrate
2. Repository class
3. Service class
4. Express route
5. Worker (if async)
6. Zod types in `shared/`
7. TanStack Query hook in `frontend/src/api/`
8. React component
9. Tests

## Phase Checklist

- [ ] Routes return `{ data, error, meta }` envelope
- [ ] All errors handled, no unhandled rejections
- [ ] SSE events for long-running ops
- [ ] Migrations committed
- [ ] Zod on all request bodies
- [ ] Auth on all protected routes
- [ ] 1 test per new service method

---

## Coding Conventions

```typescript
// Service method
export class IngestService {
  constructor(private readonly repo: RepoRepository) {}
  async ingestRepository(repoId: string): Promise<IngestResult> {
    const repo = await this.repo.findById(repoId)
    if (!repo) throw new NotFoundError(`Repository ${repoId} not found`)
  }
}

// Route handler
router.post('/repos/:id/ingest', auth, async (req, res, next) => {
  try {
    const job = await ingestService.queueIngest(req.params.id)
    res.json({ data: { jobId: job.id } })
  } catch (err) { next(err) }
})

// Response envelopes
res.json({ data: result, error: null, meta: { took: Date.now() - start } })
res.status(400).json({ data: null, error: { code: 'VALIDATION_ERROR', message: err.message } })
```

---

## Agent Prompts

Stored in `backend/src/lib/prompts.ts` — never hardcode inline.
- Coding Agent: `CODING_AGENT_SYSTEM` — model `claude-sonnet-4-5`, max 4096 tokens
- Review Agent: `REVIEW_AGENT_SYSTEM` — model `claude-sonnet-4-5`, max 1024 tokens

---

## Common Pitfalls

| Pitfall | Fix |
|---|---|
| pgvector not enabled | `CREATE EXTENSION IF NOT EXISTS vector;` in first migration |
| BullMQ job hanging | Call `job.updateProgress()` regularly |
| GitHub rate limit | Use GitHub App not PAT |
| tree-sitter WASM | `await parser.init()` before parse calls |
| Embedding cold start | Load model once at worker startup |
| SSE drops | Implement `retry:` header + client reconnect |
| `$queryRaw` injection | Use `Prisma.sql` tagged template only |

---

## Git Workflow

```
main     ← production, protected
develop  ← integration
feature/CM-{ticket}-{slug}
fix/CM-{ticket}-{slug}
```
Commits: `type(scope): message` — feat, fix, chore, docs, test, refactor

---

## Session Start Protocol

1. `git status` + last 5 commits
2. Read `docs/PROGRESS.md`
3. `npm test`
4. Begin work

Update `docs/PROGRESS.md` at session end.
