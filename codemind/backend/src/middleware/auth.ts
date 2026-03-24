import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { UnauthorizedError, ForbiddenError } from './error'
import type { Role } from '@codemind/shared'

interface JwtPayload {
  id: string
  email: string
  role: Role
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return next(new UnauthorizedError('Missing token'))

  try {
    const token = header.slice(7)
    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload
    req.user = { id: payload.id, email: payload.email, role: payload.role }
    return next()
  } catch {
    return next(new UnauthorizedError('Invalid or expired token'))
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError())
    if (!roles.includes(req.user.role)) return next(new ForbiddenError('Insufficient permissions'))
    return next()
  }
}
