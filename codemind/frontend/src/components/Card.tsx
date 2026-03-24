import React from 'react'

interface Props {
  title?: string
  children: React.ReactNode
  className?: string
  bordered?: boolean
}

const Card: React.FC<Props> = ({ title, children, className = '', bordered = true }) => (
  <div
    className={[
      'rounded-xl bg-gray-900 p-5',
      bordered ? 'border border-gray-800' : '',
      className,
    ].join(' ')}
  >
    {title && (
      <h3 className="mb-4 font-semibold text-gray-200">{title}</h3>
    )}
    {children}
  </div>
)

export default Card
