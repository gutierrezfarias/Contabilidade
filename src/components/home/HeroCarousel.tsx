import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { HomeSlide, SlideTheme } from '../../types/home'

interface HeroCarouselProps {
  slides: HomeSlide[]
}

const themes: Record<SlideTheme, string> = {
  focus:
    'from-slate-950 via-indigo-950 to-indigo-700 before:bg-indigo-400 after:bg-cyan-300',
  balance:
    'from-slate-950 via-teal-950 to-emerald-700 before:bg-emerald-300 after:bg-sky-300',
  growth:
    'from-slate-950 via-violet-950 to-fuchsia-800 before:bg-violet-300 after:bg-rose-300',
}

export function HeroCarousel({ slides }: HeroCarouselProps) {
  const [activeSlide, setActiveSlide] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length)
    }, 6000)

    return () => window.clearInterval(timer)
  }, [slides.length])

  return (
    <section aria-label="Destaques" className="relative min-h-[680px] overflow-hidden sm:min-h-[740px]">
      {slides.map((slide, index) => (
        <article
          aria-hidden={activeSlide !== index}
          className={`absolute inset-0 bg-gradient-to-br transition-opacity duration-1000 before:absolute before:right-[10%] before:top-[16%] before:h-72 before:w-72 before:rounded-full before:opacity-25 before:blur-3xl after:absolute after:-bottom-20 after:right-[24%] after:h-80 after:w-80 after:rounded-full after:opacity-20 after:blur-3xl ${themes[slide.theme]} ${
            activeSlide === index ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          key={slide.id}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_38%,rgba(255,255,255,0.16),transparent_26%),linear-gradient(90deg,rgba(2,6,23,0.18),transparent)]" />
          <div className="relative mx-auto flex min-h-[680px] max-w-7xl items-center px-5 pt-24 sm:min-h-[740px] sm:px-8">
            <div className="max-w-3xl text-white">
              <p className="mb-5 text-sm font-semibold uppercase tracking-[0.28em] text-white/65">
                {slide.eyebrow}
              </p>
              <h1 className="max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
                {slide.title}
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/75 sm:text-lg">
                {slide.description}
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link
                  className="inline-flex h-13 items-center rounded-xl bg-white px-6 text-sm font-semibold text-slate-900 transition hover:bg-indigo-50"
                  to={slide.buttonUrl || '/cadastro'}
                >
                  {slide.buttonLabel || 'Comecar agora'}
                </Link>
                <Link
                  className="inline-flex h-13 items-center rounded-xl border border-white/25 bg-white/5 px-6 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"
                  to="/login"
                >
                  Acessar sistema
                </Link>
              </div>
            </div>
          </div>
        </article>
      ))}

      <div className="absolute bottom-9 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-white/10 p-2 backdrop-blur-md">
        {slides.map((slide, index) => (
          <button
            aria-label={`Mostrar slide ${index + 1}: ${slide.title}`}
            className={`h-2.5 rounded-full transition-all ${
              index === activeSlide ? 'w-10 bg-white' : 'w-2.5 bg-white/45 hover:bg-white/70'
            }`}
            key={slide.id}
            onClick={() => setActiveSlide(index)}
            type="button"
          />
        ))}
      </div>
    </section>
  )
}
