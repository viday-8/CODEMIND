# PROGRESS.md

## Current Phase: P1 (all subtasks complete) → Ready for P2 wiring

## Completed Subtasks
- [x] P1-01 · Monorepo scaffold — Express + Prisma + Vite + health endpoint
- [x] P1-02 · JWT auth — register, login, authMiddleware, requireRole
- [x] P1-03 · Repository model + IngestService + repos router
- [x] P1-04 · BullMQ + Redis + SSE job stream endpoint
- [x] P1-05 · GitHubService — tree fetch, file content, raw fallback
- [x] P1-06 · ParserService — regex-based AST for JS/TS/Python/Java/Go
- [x] P1-07 · GraphService + GraphRepository — build nodes + edges
- [x] P1-08 · EmbedService + FileRepository.findSimilar — pgvector embeddings
- [x] P2-01 · Search API stub + TaskRepository + task routes (approve/reject/patch-script)
- [x] P2-02 · Frontend scaffold — React Router, Zustand, Axios interceptor, TanStack Query
- [x] P2-03 · ConnectPage — repo list, connect form, SSE ingest progress
- [x] P2-04 · GraphPage — force-directed canvas, D3 layout, node detail panel
- [x] P2-05 · RequestPage — change type chips, live vector search, 5 examples
- [x] P3-01–04 · AgentWorker — full 6-step pipeline, Claude, diff parsing, SSE events + AgentPage
- [x] P4-01–02 · ReviewWorker — heuristics + Claude AI review + verdict merge
- [x] P5-01–02 · Approval API + ApprovalPage — diff viewer, verdict panel, approve/reject modals
- [x] P6-01 · PatchWorker — branch + commit + GitHub PR creation
- [x] P6-02 · Patch script fallback endpoint + download button
- [x] P6-03 · Rejection loop — attempt increment, max 5, re-queue with feedback
- [x] P6-04 · OutputPage — PR URL card, audit log, stats

## In Progress
- (none)

## Next Steps (to run the app)
1. Copy `.env` files: `cp backend/.env.example backend/.env` and fill in secrets
2. Create database: `createdb codemind`
3. Enable pgvector: `psql codemind -c "CREATE EXTENSION IF NOT EXISTS vector;"`
4. Install deps: `npm install` from monorepo root
5. Run migration: `cd backend && npx prisma migrate dev --name init`
6. Start: `npm run dev` from root

## Open Questions
- tree-sitter WASM on Apple Silicon: if needed, set `NODE_OPTIONS=--experimental-vm-modules`
- GitHub App vs PAT: PAT sufficient for MVP, App preferred for production (higher rate limit)
- pgvector IVFFlat index: run after first embed batch for faster search
  `CREATE INDEX ON "File" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`

## Last Session Notes (2026-03-24)
- Full application built in one session across all 6 phases / 24 subtasks
- Backend: Express + Prisma + BullMQ workers (ingest/agent/review/patch)
- Frontend: React + Vite + TanStack Query + Zustand + all feature pages
- Vector search stub in repos router — activates automatically once files have embeddings
- Diff viewer uses react-diff-viewer-continued (shows unified diff, not split — adjust if needed)
