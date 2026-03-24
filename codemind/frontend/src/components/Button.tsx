import React from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: React.ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-800',
  secondary: 'border border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white',
  danger:    'border border-red-700 text-red-400 hover:bg-red-950',
  ghost:     'text-gray-400 hover:text-white hover:bg-gray-800',
}

const sizeClasses: Record<Size, string> = {
  sm:  'px-3 py-1.5 text-xs',
  md:  'px-4 py-2 text-sm',
  lg:  'px-5 py-2.5 text-base',
}

const Button: React.FC<Props> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={[
      'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      variantClasses[variant],
      sizeClasses[size],
      className,
    ].join(' ')}
  >
    {loading && (
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
    )}
    {children}
  </button>
)

export default Button
