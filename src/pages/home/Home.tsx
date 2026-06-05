import { useEffect, useState } from 'react'
import { HomeFooter } from '../../components/home/HomeFooter'
import { HomeHeader } from '../../components/home/HomeHeader'
import { HeroCarousel } from '../../components/home/HeroCarousel'
import { MovingBanners } from '../../components/home/MovingBanners'
import { loadHomeContent } from '../../services/homeCmsService'
import { footerContent, homeBanners, homeSlides } from '../../services/homeContent'
import type { FooterContent, HomeBanner, HomeSlide } from '../../types/home'
import './Home.css'

export function Home() {
  const [slides, setSlides] = useState<HomeSlide[]>(homeSlides)
  const [banners, setBanners] = useState<HomeBanner[]>(homeBanners)
  const [footer, setFooter] = useState<FooterContent>(footerContent)

  useEffect(() => {
    loadHomeContent()
      .then((content) => {
        setSlides(content.slides)
        setBanners(content.banners)
        setFooter(content.footer)
      })
      .catch(() => undefined)
  }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      <HomeHeader />
      <main>
        <HeroCarousel slides={slides} />
        <MovingBanners banners={banners} />
      </main>
      <HomeFooter content={footer} />
    </div>
  )
}
