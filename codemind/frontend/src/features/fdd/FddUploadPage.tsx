import React, { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRepo, useJobStream } from '../../api/repos.api'
import { useUploadFdd, useFdd } from '../../api/fdd.api'

const ACCEPTED_TYPES = '.pdf,.docx,.md,.txt'
const ACCEPTED_MIME  = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]

const STEPS = ['Parsing document', 'Extracting requirements', 'Gap analysis', 'Complete']

export default function FddUploadPage() {
  const { id: repoId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: repo } = useRepo(repoId!)

  const [file, setFile]       = useState<File | null>(null)
  const [fddId, setFddId]     = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { mutateAsync: uploadFdd, isPending: isUploading } = useUploadFdd()

  // Poll FDD status once we have an ID
  const { data: fdd } = useFdd(fddId ?? '')
  const bullJobId = fdd?.bullJobId ?? null
  const { events, done } = useJobStream(bullJobId)

  const stepEvents  = events.filter((e: any) => e.type === 'step')
  const errorEvent  = events.find((e: any) => e.type === 'error') ?? (fdd?.status === 'FAILED' ? { message: fdd.errorMessage ?? 'Analysis failed' } : null)
  const currentStep = stepEvents.filter((e: any) => e.status === 'done').length

  // Navigate to review once ready
  React.useEffect(() => {
    if (fdd?.status === 'READY') {
      navigate(`/fdd/${fdd.id}`)
    }
  }, [fdd?.status, fdd?.id, navigate])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (f && !ACCEPTED_MIME.includes(f.type)) {
      setError('Unsupported file type. Please upload a PDF, DOCX, MD, or TXT file.')
      return
    }
    setError(null)
    setFile(f)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !repoId) return
    setError(null)
    try {
      const result = await uploadFdd({ repositoryId: repoId, file })
      setFddId(result.fddId)
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'Upload failed. Please try again.')
    }
  }

  const isAnalyzing = !!fddId && fdd?.status !== 'READY' && fdd?.status !== 'FAILED'

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="flex items-center gap-4 border-b border-gray-800 px-6 py-4">
        <button onClick={() => navigate(`/repos/${repoId}/tasks`)} className="text-sm text-gray-400 hover:text-white">
          ← {repo?.name ?? 'Back'}
        </button>
        <span className="text-gray-600">/</span>
        <span className="text-sm text-gray-300">Upload FDD</span>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-2 text-2xl font-bold">Upload Functional Design Document</h1>
        <p className="mb-8 text-sm text-gray-400">
          Upload your FDD and CodeMind will extract requirements and classify them as GAP (new), UPDATE (partial), or EXISTING (already implemented).
        </p>

        {!isAnalyzing ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Drop zone */}
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-700 bg-gray-900 px-8 py-12 transition-colors hover:border-gray-500"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="mb-3 text-4xl">📄</div>
              {file ? (
                <div className="text-center">
                  <p className="font-medium text-white">{file.name}</p>
                  <p className="mt-1 text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="font-medium text-gray-300">Click to select or drag & drop</p>
                  <p className="mt-1 text-xs text-gray-500">PDF, DOCX, MD, TXT — max 20 MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!file || isUploading}
              className="w-full rounded-lg bg-brand-600 px-4 py-3 font-semibold transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading ? 'Uploading...' : 'Analyse Document'}
            </button>
          </form>
        ) : (
          /* Analysis progress */
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8">
            <h2 className="mb-6 font-semibold text-lg">Analysing document...</h2>
            <div className="space-y-4">
              {STEPS.map((label, i) => {
                const isDone   = i < currentStep
                const isActive = i === currentStep && !done && !errorEvent
                return (
                  <div key={label} className="flex items-center gap-3">
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      isDone   ? 'bg-green-500 text-white'
                      : isActive ? 'animate-pulse bg-brand-500 text-white'
                      : 'bg-gray-700 text-gray-400'
                    }`}>
                      {isDone ? '✓' : isActive ? '⟳' : i + 1}
                    </div>
                    <span className={isDone ? 'text-gray-300' : isActive ? 'font-medium text-white' : 'text-gray-600'}>
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>

            {errorEvent && (
              <div className="mt-6 rounded-lg border border-red-800 bg-red-950/30 p-4">
                <p className="text-sm text-red-400">Error: {(errorEvent as any).message}</p>
                <button
                  onClick={() => { setFddId(null); setFile(null) }}
                  className="mt-2 text-sm text-gray-400 hover:text-white"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
