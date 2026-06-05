import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface AuthLayoutProps {
  children: ReactNode
  subtitle: string
  title: string
}

export function AuthLayout({ children, subtitle, title }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <section className="relative hidden w-[45%] overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-36 -top-32 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute -bottom-28 left-4 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl" />
        <Link className="relative flex items-center gap-3 text-lg font-semibold" to="/login">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-xl">
            A
          </span>
          Aurora Personal
        </Link>
        <div className="relative max-w-md">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-300">
            Gestão pessoal
          </p>
          <h2 className="text-4xl font-semibold leading-tight">
            Organize suas rotinas com clareza e confiança.
          </h2>
          <p className="mt-5 text-base leading-7 text-slate-300">
            Um espaço moderno para acompanhar indicadores, tarefas e decisões importantes.
          </p>
        </div>
        <p className="relative text-sm text-slate-400">Sistema demonstrativo com dados mockados</p>
      </section>

      <main className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
        <div className="w-full max-w-md">
          <Link className="mb-10 flex items-center gap-3 font-semibold text-slate-900 lg:hidden" to="/login">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl text-white">
              A
            </span>
            Aurora Personal
          </Link>
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-9">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-2 mb-8 text-sm leading-6 text-slate-500">{subtitle}</p>
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
