import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
  label: string
}

export function Input({ error, id, label, required, ...props }: InputProps) {
  const errorId = error && id ? `${id}-error` : undefined

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      <input
        aria-describedby={errorId}
        aria-invalid={Boolean(error)}
        className={`h-12 w-full rounded-xl border bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
          error
            ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100'
            : 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-100'
        }`}
        id={id}
        required={required}
        {...props}
      />
      {error && (
        <p className="text-sm text-rose-600" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}
