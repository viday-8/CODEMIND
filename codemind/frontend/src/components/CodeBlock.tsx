import React, { useEffect, useRef } from 'react'
import Prism from 'prismjs'
import 'prismjs/themes/prism-tomorrow.css'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-go'

interface Props {
  code: string
  language?: string
  maxHeight?: string
}

const CodeBlock: React.FC<Props> = ({ code, language = 'typescript', maxHeight = '400px' }) => {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (ref.current) Prism.highlightElement(ref.current)
  }, [code, language])

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-2">
        <span className="text-xs text-gray-500">{language}</span>
        <button
          onClick={() => navigator.clipboard.writeText(code)}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          Copy
        </button>
      </div>
      <div className="overflow-auto" style={{ maxHeight }}>
        <pre className="m-0 p-4 text-sm leading-relaxed">
          <code ref={ref} className={`language-${language}`}>
            {code}
          </code>
        </pre>
      </div>
    </div>
  )
}

export default CodeBlock
