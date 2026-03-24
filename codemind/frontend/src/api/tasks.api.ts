import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { CreateTaskInput } from '@codemind/shared'

export function useTasks(repoId?: string) {
  return useQuery({
    queryKey: ['tasks', repoId],
    queryFn: async () => {
      const { data } = await api.get<{ data: any[] }>('/tasks', { params: { repoId } })
      return data.data
    },
  })
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: async () => {
      const { data } = await api.get<{ data: any }>(`/tasks/${id}`)
      return data.data
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      const polling = ['AGENT_RUNNING', 'REVIEW_RUNNING', 'PATCHING']
      return polling.includes(status) ? 3000 : false
    },
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateTaskInput) => {
      const { data } = await api.post<{ data: any }>('/tasks', body)
      return data.data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tasks', data.repositoryId] })
    },
  })
}

export function useApproveTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { data } = await api.post<{ data: any }>(`/tasks/${taskId}/approve`)
      return data.data
    },
    onSuccess: (_data, taskId) => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })
}

export function useRejectTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, reason }: { taskId: string; reason: string }) => {
      const { data } = await api.post<{ data: any }>(`/tasks/${taskId}/reject`, { reason })
      return data.data
    },
    onSuccess: (_data, { taskId }) => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })
}
