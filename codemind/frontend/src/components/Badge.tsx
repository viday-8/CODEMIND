import React from 'react'

const variants = {
  green:  'bg-green-900/50 text-green-300 border border-green-700',
  yellow: 'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
  red:    'bg-red-900/50 text-red-300 border border-red-700',
  blue:   'bg-blue-900/50 text-blue-300 border border-blue-700',
  gray:   'bg-gray-800 text-gray-300 border border-gray-600',
}

interface Props {
  label: string
  variant?: keyof typeof variants
}

export default function Badge({ label, variant = 'gray' }: Props) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${variants[variant]}`}>
      {label}
    </span>
  )
}

export function statusVariant(status: string): keyof typeof variants {
  if (['DONE', 'READY', 'PASS'].includes(status)) return 'green'
  if (['AGENT_RUNNING', 'REVIEW_RUNNING', 'PATCHING', 'INGESTING'].includes(status)) return 'blue'
  if (['AWAITING_APPROVAL', 'WARN'].includes(status)) return 'yellow'
  if (['FAILED', 'ERROR', 'BLOCK'].includes(status)) return 'red'
  return 'gray'
}
