import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { FunctionalDoc } from '@codemind/shared'

const TERMINAL_STATUSES = ['READY', 'FAILED']

export function useFdds(repoId?: string) {
  return useQuery({
    queryKey: ['fdds', repoId],
    queryFn: async () => {
      const { data } = await api.get<{ data: FunctionalDoc[] }>('/fdd', { params: { repoId } })
      return data.data
    },
    enabled: !!repoId,
  })
}

export function useFdd(id: string) {
  return useQuery({
    queryKey: ['fdd', id],
    queryFn: async () => {
      const { data } = await api.get<{ data: FunctionalDoc }>(`/fdd/${id}`)
      return data.data
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && TERMINAL_STATUSES.includes(status) ? false : 2000
    },
  })
}

export function useUploadFdd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ repositoryId, file }: { repositoryId: string; file: File }) => {
      const form = new FormData()
      form.append('repositoryId', repositoryId)
      form.append('document', file)
      const { data } = await api.post<{ data: { fddId: string; bullJobId: string; status: string } }>(
        '/fdd/upload',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 },
      )
      return data.data
    },
    onSuccess: (_data, { repositoryId }) => {
      qc.invalidateQueries({ queryKey: ['fdds', repositoryId] })
    },
  })
}

export function useExecuteFdd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      fddId,
      requirementIds,
      model,
    }: {
      fddId: string
      requirementIds: string[]
      model?: string
    }) => {
      const { data } = await api.post<{ data: Array<{ requirementId: string; taskId: string }> }>(
        `/fdd/${fddId}/execute`,
        { requirementIds, model: model ?? 'claude-sonnet-4-6' },
      )
      return data.data
    },
    onSuccess: (_data, { fddId }) => {
      qc.invalidateQueries({ queryKey: ['fdd', fddId] })
    },
  })
}
