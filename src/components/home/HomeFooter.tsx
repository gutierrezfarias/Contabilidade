import { Link } from 'react-router-dom'
import type { FooterContent } from '../../types/home'

interface HomeFooterProps {
  content: FooterContent
}

export function HomeFooter({ content }: HomeFooterProps) {
  return (
    <footer className="bg-slate-950 text-slate-300" id="contato">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[1.35fr_0.85fr_0.85fr_1fr]">
        <div id="sobre">
          <Link className="flex items-center gap-3 text-lg font-semibold text-white" to="/">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-xl">
              A
            </span>
            Aurora Personal
          </Link>
          <p className="mt-5 max-w-sm text-sm leading-7 text-slate-400">{content.description}</p>
        </div>

        {content.groups.map((group) => (
          <div key={group.title}>
            <h2 className="mb-5 text-sm font-semibold text-white">{group.title}</h2>
            <ul className="space-y-3 text-sm text-slate-400">
              {group.links.map((link) => (
                <li key={typeof link === 'string' ? link : link.label}>
                  {typeof link === 'string' || !link.url ? (
                    <span className="transition hover:text-white">
                      {typeof link === 'string' ? link : link.label}
                    </span>
                  ) : link.url.startsWith('/') ? (
                    <Link className="transition hover:text-white" to={link.url}>
                      {link.label}
                    </Link>
                  ) : (
                    <a className="transition hover:text-white" href={link.url} rel="noreferrer" target="_blank">
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <h2 className="mb-5 text-sm font-semibold text-white">Fale conosco</h2>
          <address className="space-y-3 text-sm not-italic text-slate-400">
            <p>{content.email}</p>
            <p>{content.phone}</p>
            <p>{content.address}</p>
          </address>
          <Link
            className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
            to="/login"
          >
            Entrar no sistema
          </Link>
        </div>
      </div>

      <div className="border-t border-white/10 px-5 py-6 text-center text-xs text-slate-500 sm:px-8">
        © {new Date().getFullYear()} Aurora Personal. Todos os direitos reservados.
      </div>
    </footer>
  )
}
