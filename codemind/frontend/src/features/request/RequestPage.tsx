import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDebounce } from '../../utils/useDebounce'
import { useRepo, useVectorSearch, useRechunk } from '../../api/repos.api'
import { useCreateTask } from '../../api/tasks.api'
import type { ChangeType, ChunkMatch, ClaudeModel } from '@codemind/shared'

const CHANGE_TYPES: ChangeType[] = ['FEATURE', 'BUG_FIX', 'REFACTOR', 'PERFORMANCE', 'SECURITY']

const MODEL_OPTIONS: { value: ClaudeModel; label: string; desc: string }[] = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', desc: 'Fastest · lowest cost' },
  { value: 'claude-sonnet-4-6',         label: 'Sonnet 4.6', desc: 'Balanced · recommended' },
  { value: 'claude-opus-4-6',           label: 'Opus 4.6',   desc: 'Most capable' },
]

const EXAMPLES = [
  { title: 'Add input validation', description: 'Add Zod validation to all user input fields in the registration form', type: 'FEATURE' as ChangeType },
  { title: 'Fix null reference bug', description: 'Fix the null reference error when user.profile is undefined in the dashboard', type: 'BUG_FIX' as ChangeType },
  { title: 'Extract helper functions', description: 'Refactor the authentication service to extract duplicate password hashing logic into a shared helper', type: 'REFACTOR' as ChangeType },
  { title: 'Add database indexing', description: 'Add a composite index on the tasks table for repositoryId and status columns to speed up filtered queries', type: 'PERFORMANCE' as ChangeType },
  { title: 'Sanitise error messages', description: 'Ensure error responses never expose internal stack traces or database error details to the client', type: 'SECURITY' as ChangeType },
]

export default function RequestPage() {
  const { id: repoId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: repo } = useRepo(repoId!)

  const [title, setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [changeType, setChangeType]   = useState<ChangeType>('FEATURE')
  const [model, setModel]             = useState<ClaudeModel>('claude-sonnet-4-6')

  const debouncedTitle       = useDebounce(title, 400)
  const debouncedDescription = useDebounce(description, 400)
  const { data: searchResults = [] } = useVectorSearch(repoId!, debouncedTitle, debouncedDescription)
  const createTask = useCreateTask()
  const rechunk = useRechunk()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const task = await createTask.mutateAsync({
      repositoryId: repoId!,
      title,
      description,
      changeType,
      model,
    })
    navigate(`/tasks/${task.id}`)
  }

  function applyExample(ex: typeof EXAMPLES[0]) {
    setTitle(ex.title)
    setDescription(ex.description)
    setChangeType(ex.type)
  }

  const canSubmit = title.trim() && description.trim().length >= 20

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="flex items-center gap-4 border-b border-gray-800 px-6 py-4">
        <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white">← Repos</button>
        <span className="text-gray-600">/</span>
        <span className="text-sm text-gray-300">{repo?.fullName}</span>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-3 gap-6 px-6 py-10">
        <div className="col-span-2">
          <h2 className="mb-6 text-xl font-bold">Request a Change</h2>

          {/* Examples */}
          <div className="mb-6 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex.title} onClick={() => applyExample(ex)}
                className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-400 hover:border-brand-500 hover:text-white">
                {ex.title}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Change type chips */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">Change Type</label>
              <div className="flex flex-wrap gap-2">
                {CHANGE_TYPES.map((t) => (
                  <button key={t} type="button" onClick={() => setChangeType(t)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      changeType === t
                        ? 'border-brand-500 bg-brand-900/50 text-brand-300'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                    }`}>
                    {t.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Model selector */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">Claude Model</label>
              <div className="flex flex-wrap gap-2">
                {MODEL_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setModel(opt.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      model === opt.value
                        ? 'border-brand-500 bg-brand-900/50 text-brand-300'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                    }`}>
                    {opt.label}
                    <span className="ml-1.5 text-[10px] opacity-60">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required
                placeholder="Brief description of the change"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={5}
                placeholder="Describe what needs to change and why... (min 20 characters)"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none resize-none"
              />
              <p className="mt-1 text-xs text-gray-500">{description.length} chars</p>
            </div>

            {createTask.error && (
              <p className="text-sm text-red-400">{(createTask.error as any).response?.data?.error?.message}</p>
            )}

            <button type="submit" disabled={!canSubmit || createTask.isPending}
              className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {createTask.isPending ? 'Submitting...' : 'Submit to AI Agent →'}
            </button>
          </form>
        </div>

        {/* Live file preview */}
        <div>
          <h3 className="mb-4 font-semibold text-gray-300">Auto-detected Files</h3>
          {rechunk.isPending ? (
            <p className="text-sm text-gray-500 animate-pulse">Indexing chunks... this may take a minute</p>
          ) : searchResults.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                {debouncedTitle || debouncedDescription
                  ? 'No indexed code found.'
                  : 'Start typing to see relevant code...'}
              </p>
              {(debouncedTitle || debouncedDescription) && (
                <button
                  onClick={() => rechunk.mutate(repoId!)}
                  className="w-full rounded border border-gray-700 py-1.5 text-xs text-gray-400 hover:border-brand-500 hover:text-white"
                >
                  Re-index code chunks
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {(searchResults as ChunkMatch[]).map((chunk) => (
                <div key={chunk.id} className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 truncate max-w-[70%]">{chunk.path}</p>
                    <span className="text-xs text-brand-400 shrink-0">{Math.round((chunk.similarity ?? 0) * 100)}%</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-gray-700">
                    <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.round((chunk.similarity ?? 0) * 100)}%` }} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {chunk.name && <span className="text-xs font-medium text-white">{chunk.name}</span>}
                    <span className="text-[10px] rounded px-1 py-0.5 bg-gray-800 text-gray-400 uppercase tracking-wide">
                      {chunk.chunkType}
                    </span>
                    <span className="text-xs text-gray-500">lines {chunk.startLine}–{chunk.endLine}</span>
                  </div>
                  {chunk.content && (
                    <pre className="text-[10px] text-gray-400 bg-gray-800 rounded px-2 py-1 overflow-hidden max-h-10 leading-relaxed">
                      {chunk.content.split('\n').slice(0, 2).join('\n')}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
