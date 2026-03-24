import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTask } from '../../api/tasks.api'
import Badge, { statusVariant } from '../../components/Badge'

export default function OutputPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: task, isLoading } = useTask(id!)

  if (isLoading) return <div className="flex h-screen items-center justify-center bg-gray-950 text-white">Loading...</div>
  if (!task)     return <div className="flex h-screen items-center justify-center bg-gray-950 text-red-400">Task not found</div>

  const pr       = task.pullRequest
  const agentJob = task.agentJobs?.[0]

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white">← Home</button>
          <span className="font-semibold">{task.title}</span>
          <Badge label={task.status} variant={statusVariant(task.status)} />
        </div>
        <button onClick={() => navigate(`/repos/${task.repositoryId}/tasks/new`)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          New Request
        </button>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        {/* PR card */}
        {pr ? (
          <div className="rounded-xl border border-green-800 bg-green-950/20 p-6">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-2xl">✓</span>
              <div>
                <h2 className="font-bold text-green-400">Pull Request Created</h2>
                <p className="text-sm text-gray-400">Branch: {pr.branchName}</p>
              </div>
            </div>
            <a href={pr.prUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-green-700 px-4 py-2 text-sm text-green-400 hover:bg-green-900/30">
              View PR #{pr.prNumber} on GitHub ↗
            </a>
            <div className="mt-3">
              <Badge label={pr.status} variant={statusVariant(pr.status)} />
            </div>
          </div>
        ) : task.status === 'PATCHING' ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 p-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            <span className="text-gray-300">Creating Pull Request...</span>
          </div>
        ) : (
          <div className="rounded-xl border border-yellow-800 bg-yellow-950/20 p-6">
            <p className="text-yellow-400">GitHub PR could not be created automatically.</p>
            {agentJob?.primaryFilePath && (
              <a href={`/api/tasks/${id}/patch-script`} download
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-yellow-700 px-4 py-2 text-sm text-yellow-400 hover:bg-yellow-900/30">
                ↓ Download patch script (.sh)
              </a>
            )}
          </div>
        )}

        {/* Task summary */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h3 className="mb-4 font-semibold">Task Summary</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Type</dt><dd>{task.changeType}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Attempts</dt><dd>{task.attempt}</dd></div>
            {agentJob?.tokenCount && (
              <div className="flex justify-between"><dt className="text-gray-500">Tokens used</dt><dd>{agentJob.tokenCount.toLocaleString()}</dd></div>
            )}
            {agentJob?.primaryFilePath && (
              <div className="flex justify-between"><dt className="text-gray-500">Primary file</dt><dd className="font-mono text-xs">{agentJob.primaryFilePath}</dd></div>
            )}
          </dl>
        </div>

        {/* Agent explanation */}
        {agentJob?.explanation && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-3 font-semibold">Agent Explanation</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{agentJob.explanation}</p>
          </div>
        )}

        {/* Pipeline audit log */}
        {agentJob?.log && agentJob.log.length > 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
            <h3 className="mb-3 font-semibold text-gray-300">Pipeline Audit Log</h3>
            <div className="h-48 overflow-y-auto font-mono text-xs space-y-0.5 text-gray-500">
              {agentJob.log.map((entry: string, i: number) => (
                <div key={i}>{entry}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
