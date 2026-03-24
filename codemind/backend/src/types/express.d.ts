import { Role } from '@codemind/shared'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        email: string
        role: Role
      }
      startTime?: number
    }
  }
}
