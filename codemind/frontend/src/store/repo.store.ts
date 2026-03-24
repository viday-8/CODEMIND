import { create } from 'zustand'

interface RepoState {
  selectedRepoId: string | null
  setSelectedRepo: (id: string | null) => void
}

export const useRepoStore = create<RepoState>((set) => ({
  selectedRepoId: null,
  setSelectedRepo: (id) => set({ selectedRepoId: id }),
}))
