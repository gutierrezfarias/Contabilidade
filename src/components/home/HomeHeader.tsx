import { Link } from 'react-router-dom'

export function HomeHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20 border-b border-white/10 bg-transparent">
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link className="flex items-center gap-3 font-semibold text-white" to="/">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-xl backdrop-blur">
            A
          </span>
          <span className="text-lg">Aurora Personal</span>
        </Link>

        <div className="hidden items-center gap-8 text-sm font-medium text-white/80 md:flex">
          <a className="transition hover:text-white" href="#recursos">
            Recursos
          </a>
          <a className="transition hover:text-white" href="#sobre">
            Sobre
          </a>
          <a className="transition hover:text-white" href="#contato">
            Contato
          </a>
        </div>

        <div className="flex items-center gap-3">
          <Link
            className="hidden h-11 items-center rounded-xl px-4 text-sm font-semibold text-white transition hover:bg-white/10 sm:inline-flex"
            to="/cadastro"
          >
            Criar conta
          </Link>
          <Link
            className="inline-flex h-11 items-center rounded-xl bg-white px-5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-indigo-50"
            to="/login"
          >
            Login
          </Link>
        </div>
      </nav>
    </header>
  )
}
