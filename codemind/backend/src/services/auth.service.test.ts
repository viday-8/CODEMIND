import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthService } from './auth.service'
import { UserRepository } from '../repositories/user.repository'
import { ConflictError, UnauthorizedError } from '../middleware/error'

// Mock bcrypt to keep tests fast
vi.mock('bcryptjs', () => ({
  default: {
    hash:    vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn(),
  },
}))

import bcrypt from 'bcryptjs'

function makeRepo(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    create:      vi.fn(),
    findByEmail: vi.fn(),
    findById:    vi.fn(),
    ...overrides,
  } as unknown as UserRepository
}

const FAKE_USER = {
  id:           'user-1',
  email:        'dev@codemind.io',
  name:         'Dev',
  passwordHash: 'hashed-password',
  role:         'DEVELOPER' as const,
  createdAt:    new Date(),
  tasks:        [],
  approvals:    [],
}

describe('AuthService.register', () => {
  it('happy path — creates user and returns token', async () => {
    const repo = makeRepo({
      findByEmail: vi.fn().mockResolvedValue(null),
      create:      vi.fn().mockResolvedValue(FAKE_USER),
    })
    const svc = new AuthService(repo)

    const result = await svc.register('dev@codemind.io', 'Dev', 'password123')

    expect(result.user.email).toBe('dev@codemind.io')
    expect(result.token).toBeTruthy()
    expect(repo.create).toHaveBeenCalledWith({
      email: 'dev@codemind.io',
      name: 'Dev',
      passwordHash: 'hashed-password',
    })
  })

  it('error path — throws ConflictError when email already exists', async () => {
    const repo = makeRepo({
      findByEmail: vi.fn().mockResolvedValue(FAKE_USER),
    })
    const svc = new AuthService(repo)

    await expect(svc.register('dev@codemind.io', 'Dev', 'password123'))
      .rejects.toThrow(ConflictError)
  })
})

describe('AuthService.login', () => {
  it('happy path — returns token on valid credentials', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
    const repo = makeRepo({ findByEmail: vi.fn().mockResolvedValue(FAKE_USER) })
    const svc = new AuthService(repo)

    const result = await svc.login('dev@codemind.io', 'password123')

    expect(result.user.id).toBe('user-1')
    expect(result.token).toBeTruthy()
  })

  it('error path — throws UnauthorizedError when user not found', async () => {
    const repo = makeRepo({ findByEmail: vi.fn().mockResolvedValue(null) })
    const svc = new AuthService(repo)

    await expect(svc.login('nobody@codemind.io', 'pass'))
      .rejects.toThrow(UnauthorizedError)
  })

  it('error path — throws UnauthorizedError on wrong password', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)
    const repo = makeRepo({ findByEmail: vi.fn().mockResolvedValue(FAKE_USER) })
    const svc = new AuthService(repo)

    await expect(svc.login('dev@codemind.io', 'wrong-pass'))
      .rejects.toThrow(UnauthorizedError)
  })
})

describe('AuthService.refreshToken', () => {
  it('happy path — issues new token from valid existing token', async () => {
    const repo = makeRepo({
      findByEmail: vi.fn().mockResolvedValue(FAKE_USER),
      findById:    vi.fn().mockResolvedValue(FAKE_USER),
    })
    const svc = new AuthService(repo)

    // Get a valid token first
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
    const { token } = await svc.login('dev@codemind.io', 'password123')

    const refreshed = await svc.refreshToken(token)
    expect(refreshed.token).toBeTruthy()
    expect(refreshed.user.id).toBe('user-1')
  })

  it('error path — throws UnauthorizedError on invalid token', async () => {
    const repo = makeRepo()
    const svc = new AuthService(repo)

    await expect(svc.refreshToken('not-a-valid-token'))
      .rejects.toThrow(UnauthorizedError)
  })
})
