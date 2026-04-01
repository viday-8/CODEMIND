import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRepo } from '../../api/repos.api'
import { useTasks, useDeleteTask } from '../../api/tasks.api'
import Badge, { statusVariant } from '../../components/Badge'
import type { TaskStatus, ChangeType } from '@codemind/shared'

const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  FEATURE: 'Feature',
  BUG_FIX: 'Bug Fix',
  REFACTOR: 'Refactor',
  PERFORMANCE: 'Performance',
  SECURITY: 'Security',
  REQUIREMENT: 'Requirement',
}

const STATUS_FILTERS: Array<TaskStatus | 'ALL'> = [
  'ALL', 'PENDING', 'AGENT_RUNNING', 'AWAITING_APPROVAL', 'DONE', 'FAILED',
]

export default function TaskHistoryPage() {
  const { id: repoId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: repo } = useRepo(repoId!)
  const { data: tasks = [], isLoading } = useTasks(repoId)

  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const { mutateAsync: deleteTask, isPending: isDeleting } = useDeleteTask()

  const filtered = statusFilter === 'ALL'
    ? tasks
    : tasks.filter((t: any) => t.status === statusFilter)

  function navigateToTask(task: any) {
    if (task.status === 'AWAITING_APPROVAL') return navigate(`/tasks/${task.id}/approval`)
    if (task.status === 'DONE') return navigate(`/tasks/${task.id}/output`)
    return navigate(`/tasks/${task.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white">← Repos</button>
          <span className="text-gray-600">/</span>
          <span className="text-sm text-gray-300">{repo?.fullName}</span>
          <span className="text-gray-600">/</span>
          <span className="text-sm text-white font-medium">Task History</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/repos/${repoId}/fdd/new`)}
            className="rounded-lg border border-brand-600 px-4 py-2 text-sm font-medium text-brand-400 hover:bg-brand-900/30"
          >
            Upload FDD
          </button>
          <button
            onClick={() => navigate(`/repos/${repoId}/tasks/new`)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + New Request
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            Change Requests
            <span className="ml-2 text-base font-normal text-gray-500">({tasks.length})</span>
          </h2>

          {/* Status filter */}
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={[
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  statusFilter === s
                    ? 'border-brand-500 bg-brand-900/50 text-brand-300'
                    : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white',
                ].join(' ')}
              >
                {s === 'ALL' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center">
            <p className="mb-4 text-gray-400">
              {statusFilter === 'ALL' ? 'No change requests yet.' : `No tasks with status "${statusFilter}".`}
            </p>
            {statusFilter === 'ALL' && (
              <button
                onClick={() => navigate(`/repos/${repoId}/tasks/new`)}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Create your first request
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-800">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900 text-left text-xs font-medium text-gray-500">
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Attempts</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filtered.map((task: any) => (
                  <tr
                    key={task.id}
                    onClick={() => navigateToTask(task)}
                    className="cursor-pointer bg-gray-900 transition-colors hover:bg-gray-800"
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">{task.title}</span>
                      {task.attempt > 1 && (
                        <span className="ml-2 text-xs text-yellow-500">retry ×{task.attempt - 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={CHANGE_TYPE_LABELS[task.changeType as ChangeType] ?? task.changeType} variant="blue" />
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={task.status.replace('_', ' ')} variant={statusVariant(task.status)} />
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-400">{task.attempt}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(task.createdAt).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {confirmDeleteId === task.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={async () => { await deleteTask(task.id); setConfirmDeleteId(null) }}
                            disabled={isDeleting}
                            className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(task.id)}
                          className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-red-950/40 hover:text-red-400"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
