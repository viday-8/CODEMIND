import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useRepos, useConnectRepo, useTriggerIngest, useJobStream, useRepoPreview, useUpdateRepoToken } from '../../api/repos.api'
import Badge, { statusVariant } from '../../components/Badge'

const QUICK_REPOS = [
  { label: 'expressjs/express', url: 'https://github.com/expressjs/express' },
  { label: 'vercel/next.js', url: 'https://github.com/vercel/next.js' },
]

const ENV_URL   = import.meta.env.VITE_DEFAULT_REPO_URL    ?? ''
const ENV_TOKEN = import.meta.env.VITE_DEFAULT_GITHUB_TOKEN ?? ''
const HAS_ENV   = !!(ENV_URL || ENV_TOKEN)

export default function ConnectPage() {
  const navigate = useNavigate()
  const { data: repos = [], isLoading } = useRepos()

  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [step, setStep] = useState<'form' | 'preview' | 'ingesting'>('form')
  const [editingTokenFor, setEditingTokenFor] = useState<string | null>(null)
  const [editToken, setEditToken] = useState('')
  const [savedTokenFor, setSavedTokenFor] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const preview       = useRepoPreview(url, token)
  const connect       = useConnectRepo()
  const ingest        = useTriggerIngest()
  const updateToken   = useUpdateRepoToken()
  const { events, done } = useJobStream(activeJobId)

  useEffect(() => {
    if (done) {
      queryClient.invalidateQueries({ queryKey: ['repos'] })
    }
  }, [done])

  function fillFromEnv() {
    if (ENV_URL)   setUrl(ENV_URL)
    if (ENV_TOKEN) setToken(ENV_TOKEN)
  }

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault()
    const result = await preview.refetch()
    if (result.data) setStep('preview')
  }

  async function handleSaveToken(repoId: string) {
    await updateToken.mutateAsync({ repoId, token: editToken })
    setSavedTokenFor(repoId)
    setEditingTokenFor(null)
    setEditToken('')
    setTimeout(() => setSavedTokenFor(null), 3000)
  }

  async function handleProceedToIngest() {
    const repo = await connect.mutateAsync({ url, token: token || undefined })
    const job  = await ingest.mutateAsync(repo.id)
    setActiveJobId(job.jobId)
    setStep('ingesting')
    setUrl('')
    setToken('')
  }

  const logEvents = events.filter((e) => e.type === 'log')
  const progress  = events.filter((e) => e.type === 'progress').at(-1)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="flex items-center border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold">CodeMind</h1>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="mb-2 text-2xl font-bold">Connect a Repository</h2>
        <p className="mb-8 text-gray-400">Paste a GitHub URL to ingest and analyse the codebase.</p>

        {/* Step 1: Form */}
        {step === 'form' && (
          <form onSubmit={handlePreview} className="mb-8 space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-6">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">GitHub URL</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none"
                required
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {HAS_ENV && (
                  <button type="button" onClick={fillFromEnv}
                    className="rounded border border-green-800 bg-green-900/30 px-2 py-1 text-xs text-green-400 hover:border-green-600 hover:text-green-300">
                    Use from .env
                  </button>
                )}
                {QUICK_REPOS.map((r) => (
                  <button key={r.url} type="button" onClick={() => setUrl(r.url)}
                    className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200">
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">GitHub Token (optional)</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_..."
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none"
              />
            </div>

            {preview.isError && (
              <p className="text-sm text-red-400">
                {(preview.error as any)?.response?.data?.error?.message ?? 'Failed to fetch repository info'}
              </p>
            )}

            <button type="submit" disabled={preview.isFetching}
              className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {preview.isFetching ? 'Fetching preview...' : 'Connect'}
            </button>
          </form>
        )}

        {/* Step 2: Preview panel */}
        {step === 'preview' && preview.data && (
          <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold">{preview.data.fullName}</h3>
                {preview.data.description && (
                  <p className="mt-1 text-sm text-gray-400">{preview.data.description}</p>
                )}
              </div>
              <div className="flex gap-3 shrink-0 text-sm text-gray-400">
                {preview.data.language && <span>{preview.data.language}</span>}
                <span>&#9733; {preview.data.stars.toLocaleString()}</span>
              </div>
            </div>

            {/* Scope summary */}
            <div className="rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3">
              <p className="text-sm font-medium text-gray-200">{preview.data.scopeMessage}</p>
              <p className="mt-0.5 text-xs text-gray-500">Branch: {preview.data.defaultBranch}</p>
            </div>

            {/* File type chips */}
            {preview.data.fileTypes.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">File Types</p>
                <div className="flex flex-wrap gap-2">
                  {preview.data.fileTypes.map(({ ext, count }) => (
                    <span key={ext} className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-300">
                      {count} {ext}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setStep('form')}
                className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-300 hover:border-gray-500">
                Back
              </button>
              <button type="button" onClick={handleProceedToIngest}
                disabled={connect.isPending || ingest.isPending}
                className="flex-1 rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {connect.isPending || ingest.isPending ? 'Starting...' : 'Proceed to Ingest'}
              </button>
            </div>

            {connect.error && (
              <p className="text-sm text-red-400">
                {(connect.error as any).response?.data?.error?.message}
              </p>
            )}
          </div>
        )}

        {/* Step 3: Ingest progress */}
        {activeJobId && (
          <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium">Ingesting repository...</span>
              <span className="text-sm text-gray-400">{progress?.pct ?? 0}%</span>
            </div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-gray-700">
              <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${progress?.pct ?? 0}%` }} />
            </div>
            <div className="h-40 overflow-y-auto font-mono text-xs space-y-0.5">
              {logEvents.map((e, i) => (
                <div key={i} className={e.level === 'error' ? 'text-red-400' : e.level === 'ok' ? 'text-green-400' : 'text-gray-400'}>
                  {e.message}
                </div>
              ))}
              {done && <div className="text-green-400 font-semibold">✓ Ingest complete!</div>}
            </div>
          </div>
        )}

        {/* Repo list */}
        <h3 className="mb-4 font-semibold text-gray-300">Connected Repositories</h3>
        {isLoading ? (
          <p className="text-gray-500">Loading...</p>
        ) : repos.length === 0 ? (
          <p className="text-gray-500">No repositories yet.</p>
        ) : (
          <div className="space-y-3">
            {repos.map((repo: any) => (
              <div key={repo.id} className="rounded-xl border border-gray-800 bg-gray-900 hover:border-gray-700">
                <div
                  className="flex cursor-pointer items-center justify-between p-4"
                  onClick={() => navigate(`/repos/${repo.id}/tasks/new`)}
                >
                  <div>
                    <div className="font-medium">{repo.fullName}</div>
                    <div className="text-sm text-gray-500">{repo.defaultBranch}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge label={repo.status} variant={statusVariant(repo.status)} />
                    {savedTokenFor === repo.id && (
                      <span className="text-xs text-green-400">Token saved!</span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setEditingTokenFor(editingTokenFor === repo.id ? null : repo.id); setEditToken(ENV_TOKEN) }}
                      className="rounded border border-yellow-800 bg-yellow-900/20 px-3 py-1 text-xs text-yellow-400 hover:border-yellow-600">
                      Set Token
                    </button>
                    {repo.status === 'READY' && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/repos/${repo.id}/tasks`) }}
                          className="rounded border border-gray-700 px-3 py-1 text-xs hover:border-gray-500">
                          Tasks
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/repos/${repo.id}/graph`) }}
                          className="rounded border border-gray-700 px-3 py-1 text-xs hover:border-gray-500">
                          Graph
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editingTokenFor === repo.id && (
                  <div className="border-t border-gray-800 px-4 py-3 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="password"
                      value={editToken}
                      onChange={(e) => setEditToken(e.target.value)}
                      placeholder="ghp_..."
                      className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none"
                    />
                    <button
                      onClick={() => handleSaveToken(repo.id)}
                      disabled={!editToken.trim() || updateToken.isPending}
                      className="rounded-lg bg-green-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
                    >
                      {updateToken.isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditingTokenFor(null); setEditToken('') }}
                      className="rounded-lg border border-gray-700 px-4 py-1.5 text-sm text-gray-400 hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
