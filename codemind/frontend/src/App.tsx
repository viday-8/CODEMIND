import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

const ConnectPage       = lazy(() => import('./features/connect/ConnectPage'))
const TaskHistoryPage   = lazy(() => import('./features/connect/TaskHistoryPage'))
const GraphPage         = lazy(() => import('./features/graph/GraphPage'))
const RequestPage       = lazy(() => import('./features/request/RequestPage'))
const AgentPage         = lazy(() => import('./features/agent/AgentPage'))
const ApprovalPage      = lazy(() => import('./features/approval/ApprovalPage'))
const OutputPage        = lazy(() => import('./features/output/OutputPage'))
const FddUploadPage     = lazy(() => import('./features/fdd/FddUploadPage'))
const FddReviewPage     = lazy(() => import('./features/fdd/FddReviewPage'))

const Spinner = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
  </div>
)

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<ConnectPage />} />
          <Route path="/repos/:id/graph" element={<GraphPage />} />
          <Route path="/repos/:id/tasks" element={<TaskHistoryPage />} />
          <Route path="/repos/:id/tasks/new" element={<RequestPage />} />
          <Route path="/repos/:id/fdd/new" element={<FddUploadPage />} />
          <Route path="/fdd/:id" element={<FddReviewPage />} />
          <Route path="/tasks/:id" element={<AgentPage />} />
          <Route path="/tasks/:id/approval" element={<ApprovalPage />} />
          <Route path="/tasks/:id/output" element={<OutputPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
