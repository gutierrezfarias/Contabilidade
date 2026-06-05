import { isValidElement, useState } from 'react'
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean
  variant?: 'primary' | 'secondary' | 'ghost'
}

const variants = {
  primary:
    'bg-indigo-600 text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700 focus-visible:outline-indigo-600',
  secondary:
    'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400',
  ghost:
    'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-slate-400',
}

function textFromNode(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map(textFromNode).join(' ')
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textFromNode(node.props.children)
  }

  return ''
}

function isProgressAction(children: ReactNode) {
  const text = textFromNode(children).toLowerCase()
  return ['salvar', 'atualizar', 'criar', 'adicionar', 'confirmar', 'finalizar'].some((action) =>
    text.includes(action),
  )
}

export function Button({
  children,
  className = '',
  disabled,
  isLoading = false,
  onClick,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const [quickProgress, setQuickProgress] = useState(false)
  const showProgress = isLoading || quickProgress

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (!disabled && !isLoading && isProgressAction(children)) {
      setQuickProgress(true)
      window.setTimeout(() => setQuickProgress(false), 700)
    }

    onClick?.(event)
  }

  return (
    <button
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      onClick={handleClick}
      type={type}
      {...props}
    >
      {showProgress && (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  )
}
