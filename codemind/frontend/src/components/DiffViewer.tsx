import React from 'react'
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'

interface Props {
  oldValue?: string
  newValue: string
  filePath?: string
  splitView?: boolean
}

const DiffViewer: React.FC<Props> = ({
  oldValue = '',
  newValue,
  filePath,
  splitView = false,
}) => {
  // Count additions/deletions from the raw diff
  const lines = newValue.split('\n')
  const additions = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length
  const deletions = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800">
      {filePath && (
        <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-2">
          <span className="font-mono text-xs text-gray-400">{filePath}</span>
          <div className="flex gap-3 text-xs">
            <span className="text-green-400">+{additions}</span>
            <span className="text-red-400">-{deletions}</span>
          </div>
        </div>
      )}
      <ReactDiffViewer
        oldValue={oldValue}
        newValue={newValue}
        splitView={splitView}
        compareMethod={DiffMethod.LINES}
        useDarkTheme
        showDiffOnly={!oldValue}
        styles={{
          variables: {
            dark: {
              diffViewerBackground: '#030712',
              addedBackground: '#052e16',
              addedColor: '#86efac',
              removedBackground: '#450a0a',
              removedColor: '#fca5a5',
              wordAddedBackground: '#14532d',
              wordRemovedBackground: '#7f1d1d',
              gutterBackground: '#111827',
              gutterColor: '#4b5563',
            },
          },
        }}
      />
    </div>
  )
}

export default DiffViewer
