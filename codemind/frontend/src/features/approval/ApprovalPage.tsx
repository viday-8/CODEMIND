import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { useTask, useApproveTask, useRejectTask } from '../../api/tasks.api'
import Badge, { statusVariant } from '../../components/Badge'

export default function ApprovalPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: task, isLoading } = useTask(id!)
  const approve = useApproveTask()
  const reject  = useRejectTask()

  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason]       = useState('')
  const [showConfirm, setShowConfirm]         = useState(false)

  const agentJob   = task?.agentJobs?.[0]
  const reviewJob  = task?.agentJobs?.find((j: any) => j.agentType === 'REVIEW')
  const verdict    = reviewJob?.verdict ?? 'PASS'
  const comments   = reviewJob?.reviewComments as any[] ?? []

  const verdictVariant = verdict === 'PASS' ? 'green' : verdict === 'WARN' ? 'yellow' : 'red'

  async function handleApprove() {
    await approve.mutateAsync(id!)
    navigate(`/tasks/${id}/output`)
  }

  async function handleReject() {
    if (!rejectReason.trim()) return
    await reject.mutateAsync({ taskId: id!, reason: rejectReason })
    navigate(`/tasks/${id}`)
  }

  if (isLoading) return <div className="flex h-screen items-center justify-center bg-gray-950 text-white">Loading...</div>
  if (!task)     return <div className="flex h-screen items-center justify-center bg-gray-950 text-red-400">Task not found</div>

  const ApproveRejectButtons = () => (
    <div className="flex gap-3">
      <button onClick={() => setShowConfirm(true)}
        className="rounded-lg bg-green-700 px-5 py-2 font-medium text-white hover:bg-green-600 disabled:opacity-50"
        disabled={approve.isPending}>
        ✓ Approve & Create PR
      </button>
      <button onClick={() => setShowRejectModal(true)}
        className="rounded-lg border border-red-700 px-5 py-2 font-medium text-red-400 hover:bg-red-950">
        ✗ Reject with reason
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white">← Home</button>
            <span className="font-semibold">{task.title}</span>
            <Badge label={task.changeType} variant="blue" />
            <span className="text-sm text-gray-500">Attempt {task.attempt}</span>
          </div>
          <ApproveRejectButtons />
        </div>
      </header>

      <div className="flex gap-0">
        {/* Diff viewer */}
        <div className="flex-1 overflow-auto border-r border-gray-800">
          {agentJob?.diffRaw ? (
            <ReactDiffViewer
              oldValue={agentJob.patchedContent ? '' : ''}
              newValue={agentJob.diffRaw}
              splitView={false}
              useDarkTheme
              showDiffOnly
            />
          ) : (
            <div className="p-8 text-gray-500">No diff available</div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-80 shrink-0 space-y-5 overflow-y-auto p-5">
          {/* Verdict */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Review Verdict</span>
              <Badge label={verdict} variant={verdictVariant} />
            </div>
            {reviewJob?.reviewSummary && (
              <p className="text-sm text-gray-400">{reviewJob.reviewSummary}</p>
            )}
          </div>

          {/* Comments */}
          {comments.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <h4 className="mb-3 text-sm font-semibold">Review Comments</h4>
              <div className="space-y-2">
                {comments.map((c: any, i: number) => (
                  <div key={i} className={`rounded-lg p-2 text-xs ${
                    c.severity === 'blocking' ? 'bg-red-950/50 text-red-300'
                    : c.severity === 'warning' ? 'bg-yellow-950/50 text-yellow-300'
                    : 'bg-gray-800 text-gray-300'
                  }`}>
                    <span className="font-medium uppercase">{c.severity}</span> · {c.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agent explanation */}
          {agentJob?.explanation && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <h4 className="mb-2 text-sm font-semibold">Agent Explanation</h4>
              <p className="text-xs text-gray-400 leading-relaxed">{agentJob.explanation}</p>
            </div>
          )}

          {/* Stats */}
          {agentJob?.tokenCount && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <h4 className="mb-2 text-sm font-semibold">Stats</h4>
              <div className="space-y-1 text-xs text-gray-400">
                <div className="flex justify-between"><span>Tokens</span><span>{agentJob.tokenCount.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>Duration</span><span>{((agentJob.durationMs ?? 0) / 1000).toFixed(1)}s</span></div>
              </div>
            </div>
          )}

          <ApproveRejectButtons />
        </div>
      </div>

      {/* Confirm approve modal */}
      {showConfirm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70">
          <div className="w-80 rounded-xl border border-gray-700 bg-gray-900 p-6">
            <h3 className="mb-2 font-bold">Approve & Create PR?</h3>
            <p className="mb-4 text-sm text-gray-400">This will create a GitHub Pull Request with the AI-generated changes.</p>
            <div className="flex gap-3">
              <button onClick={handleApprove} disabled={approve.isPending}
                className="flex-1 rounded-lg bg-green-700 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50">
                {approve.isPending ? 'Creating...' : 'Confirm'}
              </button>
              <button onClick={() => setShowConfirm(false)} className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-gray-300 hover:bg-gray-800">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70">
          <div className="w-96 rounded-xl border border-gray-700 bg-gray-900 p-6">
            <h3 className="mb-2 font-bold">Reject with Reason</h3>
            <p className="mb-3 text-sm text-gray-400">Describe what is wrong. The agent will use this feedback on the next attempt.</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              rows={4} placeholder="What needs to be fixed?"
              className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none resize-none"
            />
            <div className="flex gap-3">
              <button onClick={handleReject} disabled={reject.isPending || rejectReason.trim().length < 10}
                className="flex-1 rounded-lg border border-red-700 py-2 text-sm font-medium text-red-400 hover:bg-red-950 disabled:opacity-50">
                {reject.isPending ? 'Rejecting...' : 'Send Feedback'}
              </button>
              <button onClick={() => setShowRejectModal(false)} className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-gray-300 hover:bg-gray-800">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
