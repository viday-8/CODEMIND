import { create } from 'zustand'

interface FddState {
  activeFddId: string | null
  selectedRequirementIds: Set<string>
  setActiveFdd: (id: string | null) => void
  toggleRequirement: (id: string) => void
  selectAll: (ids: string[]) => void
  clearSelection: () => void
}

export const useFddStore = create<FddState>((set) => ({
  activeFddId: null,
  selectedRequirementIds: new Set(),
  setActiveFdd: (id) => set({ activeFddId: id, selectedRequirementIds: new Set() }),
  toggleRequirement: (id) =>
    set((s) => {
      const next = new Set(s.selectedRequirementIds)
      next.has(id) ? next.delete(id) : next.add(id)
      return { selectedRequirementIds: next }
    }),
  selectAll: (ids) => set({ selectedRequirementIds: new Set(ids) }),
  clearSelection: () => set({ selectedRequirementIds: new Set() }),
}))
