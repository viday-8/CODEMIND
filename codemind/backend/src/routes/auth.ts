import { Router } from 'express'
import { AuthService } from '../services/auth.service'
import { UserRepository } from '../repositories/user.repository'
import { authMiddleware } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { prisma } from '../lib/prisma'
import { RegisterSchema, LoginSchema } from '@codemind/shared'

const router = Router()
const authService = new AuthService(new UserRepository(prisma))

router.post('/auth/register', validate(RegisterSchema), async (req, res, next) => {
  const start = Date.now()
  try {
    const { email, name, password } = req.body
    const result = await authService.register(email, name, password)
    res.status(201).json({ data: result, error: null, meta: { took: Date.now() - start } })
  } catch (err) {
    next(err)
  }
})

router.post('/auth/login', validate(LoginSchema), async (req, res, next) => {
  const start = Date.now()
  try {
    const { email, password } = req.body
    const result = await authService.login(email, password)
    res.json({ data: result, error: null, meta: { took: Date.now() - start } })
  } catch (err) {
    next(err)
  }
})

router.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ data: { user: req.user }, error: null, meta: { took: 0 } })
})

router.post('/auth/refresh', async (req, res, next) => {
  const start = Date.now()
  try {
    const token = req.body?.token ?? req.headers.authorization?.replace('Bearer ', '')
    const result = await authService.refreshToken(token)
    res.json({ data: result, error: null, meta: { took: Date.now() - start } })
  } catch (err) {
    next(err)
  }
})

export default router
