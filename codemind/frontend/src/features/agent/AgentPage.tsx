import React, { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTask } from '../../api/tasks.api'
import { useJobStream } from '../../api/repos.api'
import Badge, { statusVariant } from '../../components/Badge'

const STEPS = [
  'Initialising',
  'Vector Search',
  'Graph Traversal',
  'Fetch Live Files',
  'Claude API',
  'Parse Diff',
]

export default function AgentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: task, refetch } = useTask(id!)

  const agentJobId = task?.agentJobs?.[0]?.id ?? null
  const { events, done } = useJobStream(agentJobId)

  const stepEvents   = events.filter((e) => e.type === 'step')
  const logEvents    = events.filter((e) => e.type === 'log')
  const contextEvent = events.find((e) => e.type === 'context')

  const currentStep  = stepEvents.filter((e) => e.status === 'done').length
  const errorEvent   = events.find((e) => e.type === 'error')

  // Auto-redirect to approval when review completes
  useEffect(() => {
    if (task?.status === 'AWAITING_APPROVAL') {
      navigate(`/tasks/${id}/approval`)
    }
  }, [task?.status, id, navigate])

  useEffect(() => {
    if (done) refetch()
  }, [done, refetch])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="flex items-center gap-4 border-b border-gray-800 px-6 py-4">
        <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white">← Home</button>
        <span className="text-gray-600">/</span>
        <span className="text-sm text-gray-300">Agent Pipeline</span>
        {task && <Badge label={task.status} variant={statusVariant(task.status)} />}
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10">
        {task && (
          <div className="mb-8">
            <h2 className="mb-1 text-xl font-bold">{task.title}</h2>
            <p className="text-sm text-gray-400">{task.description}</p>
          </div>
        )}

        {/* Step timeline */}
        <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h3 className="mb-4 font-semibold">Pipeline Steps</h3>
          <div className="space-y-3">
            {STEPS.map((label, i) => {
              const isDone   = i < currentStep
              const isActive = i === currentStep && !done && !errorEvent
              return (
                <div key={label} className="flex items-center gap-3">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    isDone   ? 'bg-green-500 text-white'
                    : isActive ? 'animate-pulse bg-brand-500 text-white'
                    : 'bg-gray-700 text-gray-400'
                  }`}>
                    {isDone ? '✓' : isActive ? '⟳' : i + 1}
                  </div>
                  <span className={isDone ? 'text-gray-300' : isActive ? 'text-white font-medium' : 'text-gray-600'}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Context card */}
        {contextEvent && (
          <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h4 className="mb-3 font-semibold text-gray-300">Context Retrieved</h4>
            <div className="space-y-2">
              {contextEvent.files.map((f: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 font-mono truncate">{f.path}</span>
                  <span className="ml-2 shrink-0 text-brand-400">{Math.round(f.similarity * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live log */}
        {logEvents.length > 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
            <h4 className="mb-2 text-sm font-semibold text-gray-400">Live Log</h4>
            <div className="h-48 overflow-y-auto font-mono text-xs space-y-0.5">
              {logEvents.map((e, i) => (
                <div key={i} className={e.level === 'error' ? 'text-red-400' : e.level === 'ok' ? 'text-green-400' : 'text-gray-500'}>
                  {e.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {errorEvent && (
          <div className="mt-4 rounded-xl border border-red-800 bg-red-950/30 p-4">
            <p className="text-red-400">Error: {errorEvent.message}</p>
            <button onClick={() => navigate('/')} className="mt-2 text-sm text-gray-400 hover:text-white">← Back to repos</button>
          </div>
        )}

        {/* Waiting for review */}
        {task?.status === 'REVIEW_RUNNING' && (
          <div className="mt-4 flex items-center gap-2 text-gray-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            Review agent running...
          </div>
        )}
      </div>
    </div>
  )
}
