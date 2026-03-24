import { vi } from 'vitest'

// Prevent config.ts from calling process.exit(1) on missing env vars during tests
process.env.DATABASE_URL         = 'postgresql://test:test@localhost:5432/codemind_test'
process.env.REDIS_URL            = 'redis://localhost:6379'
process.env.ANTHROPIC_API_KEY    = 'sk-ant-test-key'
process.env.JWT_SECRET           = 'test-secret-must-be-at-least-32-chars-long!'
process.env.JWT_EXPIRES_IN       = '1h'
process.env.PORT                 = '4001'
process.env.NODE_ENV             = 'test'
process.env.LOG_LEVEL            = 'error'
process.env.EMBEDDING_MODEL      = 'Xenova/all-MiniLM-L6-v2'

// Silence pino output in tests
vi.mock('../lib/logger', () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}))
