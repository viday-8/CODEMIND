import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useFdd, useExecuteFdd } from '../../api/fdd.api'
import { useFddStore } from '../../store/fdd.store'
import Badge from '../../components/Badge'
import type { FddRequirement, RequirementClassification, ClaudeModel } from '@codemind/shared'

const MODEL_OPTIONS: { value: ClaudeModel; label: string }[] = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  { value: 'claude-sonnet-4-6',         label: 'Sonnet 4.6' },
  { value: 'claude-opus-4-6',           label: 'Opus 4.6'  },
]

function classificationVariant(c: RequirementClassification | null): 'red' | 'yellow' | 'green' | 'gray' {
  if (c === 'GAP')      return 'red'
  if (c === 'UPDATE')   return 'yellow'
  if (c === 'EXISTING') return 'green'
  return 'gray'
}

function classificationLabel(c: RequirementClassification | null) {
  if (c === 'GAP')      return 'GAP — New'
  if (c === 'UPDATE')   return 'UPDATE — Partial'
  if (c === 'EXISTING') return 'EXISTING — Standard'
  return 'Analysing...'
}

export default function FddReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: fdd, isLoading } = useFdd(id!)
  const { mutateAsync: executeFdd, isPending: isExecuting } = useExecuteFdd()

  const { selectedRequirementIds, toggleRequirement, selectAll, clearSelection } = useFddStore()
  const [model, setModel] = useState<ClaudeModel>('claude-sonnet-4-6')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [execError, setExecError] = useState<string | null>(null)

  const actionableReqs = (fdd?.requirements ?? []).filter(
    (r) => (r.classification === 'GAP' || r.classification === 'UPDATE') && !r.taskId
  )

  const counts = {
    total:    fdd?.requirements.length ?? 0,
    gap:      fdd?.requirements.filter((r) => r.classification === 'GAP').length ?? 0,
    update:   fdd?.requirements.filter((r) => r.classification === 'UPDATE').length ?? 0,
    existing: fdd?.requirements.filter((r) => r.classification === 'EXISTING').length ?? 0,
  }

  async function handleExecute() {
    if (!fdd || selectedRequirementIds.size === 0) return
    setExecError(null)
    try {
      await executeFdd({
        fddId: fdd.id,
        requirementIds: Array.from(selectedRequirementIds),
        model,
      })
      clearSelection()
      navigate(`/repos/${fdd.repositoryId}/tasks`)
    } catch (err: any) {
      setExecError(err?.response?.data?.error?.message ?? 'Execution failed. Please try again.')
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    )
  }

  if (!fdd) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white">
        <p>FDD not found.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="flex items-center gap-4 border-b border-gray-800 px-6 py-4">
        <button onClick={() => navigate(`/repos/${fdd.repositoryId}/tasks`)} className="text-sm text-gray-400 hover:text-white">
          ← Tasks
        </button>
        <span className="text-gray-600">/</span>
        <span className="text-sm text-gray-300 truncate max-w-xs">{fdd.fileName}</span>
        <Badge
          label={fdd.status}
          variant={fdd.status === 'READY' ? 'green' : fdd.status === 'FAILED' ? 'red' : 'blue'}
        />
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {fdd.status === 'FAILED' && (
          <div className="mb-6 rounded-lg border border-red-800 bg-red-950/30 p-4">
            <p className="text-sm text-red-400">Analysis failed: {fdd.errorMessage ?? 'Unknown error'}</p>
          </div>
        )}

        {fdd.status !== 'READY' && fdd.status !== 'FAILED' && (
          <div className="mb-6 flex items-center gap-2 text-gray-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            <span className="text-sm">Analysis in progress — {fdd.status.toLowerCase()}...</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
          {/* Requirements list */}
          <div className="space-y-4">
            {/* Bulk actions */}
            {fdd.status === 'READY' && actionableReqs.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-5 py-3">
                <button
                  onClick={() => selectAll(actionableReqs.map((r) => r.id))}
                  className="text-sm text-brand-400 hover:text-brand-300"
                >
                  Select all actionable ({actionableReqs.length})
                </button>
                {selectedRequirementIds.size > 0 && (
                  <button onClick={clearSelection} className="text-sm text-gray-500 hover:text-gray-300">
                    Clear
                  </button>
                )}

                {selectedRequirementIds.size > 0 && (
                  <div className="ml-auto flex items-center gap-3">
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value as ClaudeModel)}
                      className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white"
                    >
                      {MODEL_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleExecute}
                      disabled={isExecuting}
                      className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold hover:bg-brand-500 disabled:opacity-50"
                    >
                      {isExecuting ? 'Executing...' : `Execute selected (${selectedRequirementIds.size})`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {execError && (
              <p className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-2 text-sm text-red-400">
                {execError}
              </p>
            )}

            {fdd.requirements.length === 0 && fdd.status === 'READY' && (
              <p className="text-sm text-gray-500">No requirements were extracted from this document.</p>
            )}

            {fdd.requirements.map((req: FddRequirement) => {
              const isSelected   = selectedRequirementIds.has(req.id)
              const isActionable = (req.classification === 'GAP' || req.classification === 'UPDATE') && !req.taskId
              const isExpanded   = expandedId === req.id

              return (
                <div
                  key={req.id}
                  className={`rounded-xl border bg-gray-900 p-5 transition-colors ${
                    isSelected ? 'border-brand-600' : 'border-gray-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <div className="mt-0.5 shrink-0">
                      {isActionable ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRequirement(req.id)}
                          className="h-4 w-4 rounded accent-brand-500"
                        />
                      ) : (
                        <div className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Header row */}
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500">#{req.order}</span>
                        <h3 className="font-semibold text-white">{req.title}</h3>
                        <Badge
                          label={classificationLabel(req.classification)}
                          variant={classificationVariant(req.classification)}
                        />
                        {req.taskId && (
                          <Link
                            to={`/tasks/${req.taskId}`}
                            className="ml-auto text-xs text-brand-400 hover:text-brand-300"
                          >
                            View Task →
                          </Link>
                        )}
                      </div>

                      {/* Description */}
                      <p className={`text-sm text-gray-400 ${isExpanded ? '' : 'line-clamp-2'}`}>
                        {req.description}
                      </p>
                      {req.description.length > 120 && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : req.id)}
                          className="mt-1 text-xs text-gray-600 hover:text-gray-400"
                        >
                          {isExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}

                      {/* Rationale */}
                      {req.rationale && (
                        <p className="mt-2 text-xs text-gray-600 italic">{req.rationale}</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Sidebar summary */}
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h3 className="mb-4 font-semibold">Document Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">File</span>
                  <span className="max-w-[140px] truncate text-right text-gray-200">{fdd.fileName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Uploaded</span>
                  <span className="text-gray-200">
                    {new Date(fdd.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Status</span>
                  <Badge
                    label={fdd.status}
                    variant={fdd.status === 'READY' ? 'green' : fdd.status === 'FAILED' ? 'red' : 'blue'}
                  />
                </div>
              </div>

              <div className="mt-5 space-y-2 border-t border-gray-800 pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total</span>
                  <span className="font-semibold">{counts.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-400">GAP (new)</span>
                  <span className="font-semibold text-red-300">{counts.gap}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-400">UPDATE (partial)</span>
                  <span className="font-semibold text-yellow-300">{counts.update}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-400">EXISTING (standard)</span>
                  <span className="font-semibold text-green-300">{counts.existing}</span>
                </div>
              </div>
            </div>

            {fdd.status === 'READY' && counts.gap + counts.update > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400">
                Select GAP and UPDATE requirements above, then click <span className="text-white">Execute selected</span> to generate code changes.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
