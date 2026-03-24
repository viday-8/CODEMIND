import { z } from 'zod'

// Auth
export const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
})

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// Repo
export const ConnectRepoSchema = z.object({
  url: z.string().url().regex(/github\.com\/.+\/.+/, 'Must be a GitHub URL'),
  token: z.string().optional(),
  branch: z.string().optional(),
})

// Task
export const CreateTaskSchema = z.object({
  repositoryId: z.string().cuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(20),
  changeType: z.enum(['FEATURE', 'BUG_FIX', 'REFACTOR', 'PERFORMANCE', 'SECURITY', 'REQUIREMENT']),
})

// Approval
export const RejectTaskSchema = z.object({
  reason: z.string().min(10),
})

export const RepoPreviewQuerySchema = z.object({
  url: z.string().url().regex(/github\.com\/.+\/.+/, 'Must be a GitHub URL'),
  token: z.string().optional(),
})

export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type ConnectRepoInput = z.infer<typeof ConnectRepoSchema>
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>
export type RejectTaskInput = z.infer<typeof RejectTaskSchema>
export type RepoPreviewQuery = z.infer<typeof RepoPreviewQuerySchema>
