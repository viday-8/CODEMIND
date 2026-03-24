import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from './client'
import type { FileMatch, RepoPreview } from '@codemind/shared'

export function useRepos() {
  return useQuery({
    queryKey: ['repos'],
    queryFn: async () => {
      const { data } = await api.get<{ data: any[] }>('/repos')
      return data.data
    },
  })
}

export function useRepo(id: string) {
  return useQuery({
    queryKey: ['repo', id],
    queryFn: async () => {
      const { data } = await api.get<{ data: any }>(`/repos/${id}`)
      return data.data
    },
    enabled: !!id,
  })
}

export function useConnectRepo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { url: string; token?: string; branch?: string }) => {
      const { data } = await api.post<{ data: any }>('/repos', body)
      return data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos'] }),
  })
}

export function useTriggerIngest() {
  return useMutation({
    mutationFn: async (repoId: string) => {
      const { data } = await api.post<{ data: { jobId: string } }>(`/repos/${repoId}/ingest`)
      return data.data
    },
  })
}

export function useVectorSearch(repoId: string, query: string) {
  return useQuery({
    queryKey: ['search', repoId, query],
    queryFn: async () => {
      const { data } = await api.get<{ data: FileMatch[] }>(`/repos/${repoId}/search`, {
        params: { q: query },
      })
      return data.data
    },
    enabled: !!repoId && query.length > 3,
  })
}

export function useGraph(repoId: string) {
  return useQuery({
    queryKey: ['graph', repoId],
    queryFn: async () => {
      const { data } = await api.get<{ data: { nodes: any[]; edges: any[] } }>(`/repos/${repoId}/graph`)
      return data.data
    },
    enabled: !!repoId,
  })
}

export function useRepoPreview(url: string, token: string) {
  return useQuery({
    queryKey: ['repo-preview', url, token],
    queryFn: async () => {
      const params: Record<string, string> = { url }
      if (token) params.token = token
      const { data } = await api.get<{ data: RepoPreview }>('/repos/preview', { params })
      return data.data
    },
    enabled: false,
    retry: false,
    staleTime: 60_000,
  })
}

export function useJobStream(jobId: string | null) {
  const [events, setEvents] = useState<any[]>([])
  const [done, setDone] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!jobId) return
    const baseUrl = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
    const es = new EventSource(`${baseUrl}/jobs/${jobId}/stream`)
    esRef.current = es

    es.onmessage = (e) => {
      const event = JSON.parse(e.data)
      setEvents((prev) => [...prev, event])
      if (event.type === 'done' || event.type === 'error') {
        setDone(true)
        es.close()
      }
    }

    es.onerror = () => {
      setDone(true)
      es.close()
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [jobId])

  return { events, done }
}
