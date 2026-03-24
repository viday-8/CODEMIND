import { create } from 'zustand'
import type { TaskStatus, ChangeType } from '@codemind/shared'

interface TaskSummary {
  id: string
  title: string
  status: TaskStatus
  changeType: ChangeType
  attempt: number
  createdAt: string
}

interface TaskState {
  activeTaskId: string | null
  taskCache: Record<string, TaskSummary>
  setActiveTask: (id: string | null) => void
  cacheTask: (task: TaskSummary) => void
}

export const useTaskStore = create<TaskState>((set) => ({
  activeTaskId: null,
  taskCache: {},
  setActiveTask: (id) => set({ activeTaskId: id }),
  cacheTask: (task) =>
    set((s) => ({ taskCache: { ...s.taskCache, [task.id]: task } })),
}))
