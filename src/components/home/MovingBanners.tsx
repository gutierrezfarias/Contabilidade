import type { HomeBanner } from '../../types/home'

interface MovingBannersProps {
  banners: HomeBanner[]
}

function BannerCard({ banner }: { banner: HomeBanner }) {
  return (
    <article className="w-[290px] shrink-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:w-[340px]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
        {banner.category}
      </p>
      <h3 className="mt-3 text-lg font-semibold text-slate-900">{banner.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{banner.description}</p>
    </article>
  )
}

export function MovingBanners({ banners }: MovingBannersProps) {
  return (
    <section className="overflow-hidden bg-slate-50 py-16 sm:py-20" id="recursos">
      <div className="mx-auto mb-10 max-w-7xl px-5 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-indigo-600">
          Possibilidades
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Tudo em movimento com você
        </h2>
      </div>

      <div className="home-marquee-mask space-y-5">
        <div className="home-marquee-track flex w-max gap-5">
          {[...banners, ...banners].map((banner, index) => (
            <BannerCard banner={banner} key={`${banner.id}-${index}`} />
          ))}
        </div>
        <div className="home-marquee-track home-marquee-track-reverse flex w-max gap-5">
          {[...banners].reverse().concat([...banners].reverse()).map((banner, index) => (
            <BannerCard banner={banner} key={`${banner.id}-reverse-${index}`} />
          ))}
        </div>
      </div>
    </section>
  )
}
