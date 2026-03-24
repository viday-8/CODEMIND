import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { UserRepository } from '../repositories/user.repository'
import { config } from '../config'
import { ConflictError, UnauthorizedError } from '../middleware/error'
import type { UserPublic } from '@codemind/shared'

interface AuthResult {
  user: UserPublic
  token: string
}

export class AuthService {
  constructor(private readonly userRepo: UserRepository) {}

  async register(email: string, name: string, password: string): Promise<AuthResult> {
    const existing = await this.userRepo.findByEmail(email)
    if (existing) throw new ConflictError('Email already registered')

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await this.userRepo.create({ email, name, passwordHash })

    const token = this.signToken(user.id, user.email, user.role)
    return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, token }
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.userRepo.findByEmail(email)
    if (!user) throw new UnauthorizedError('Invalid credentials')

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) throw new UnauthorizedError('Invalid credentials')

    const token = this.signToken(user.id, user.email, user.role)
    return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, token }
  }

  async refreshToken(existingToken: string): Promise<AuthResult> {
    let payload: { id: string; email: string; role: string }
    try {
      payload = jwt.verify(existingToken, config.JWT_SECRET) as typeof payload
    } catch {
      throw new UnauthorizedError('Invalid or expired token')
    }

    const user = await this.userRepo.findById(payload.id)
    if (!user) throw new UnauthorizedError('User not found')

    const token = this.signToken(user.id, user.email, user.role)
    return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, token }
  }

  private signToken(id: string, email: string, role: string): string {
    return jwt.sign({ id, email, role }, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    })
  }
}
