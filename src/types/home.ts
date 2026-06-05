export type SlideTheme = 'focus' | 'balance' | 'growth'

export interface HomeSlide {
  id: string
  eyebrow: string
  title: string
  description: string
  theme: SlideTheme
  buttonLabel?: string
  buttonUrl?: string
  imageUrl?: string
  sortOrder?: number
  active?: boolean
}

export interface HomeBanner {
  id: string
  category: string
  title: string
  description: string
  imageUrl?: string
  sortOrder?: number
  active?: boolean
}

export interface FooterDisplayLink {
  label: string
  url?: string
}

export interface FooterGroup {
  id?: string
  title: string
  links: Array<string | FooterDisplayLink>
}

export interface FooterLinkRecord {
  id: string
  groupId: string
  label: string
  url: string
  sortOrder: number
  active: boolean
}

export interface FooterGroupRecord {
  id: string
  title: string
  sortOrder: number
  links: FooterLinkRecord[]
}

export interface FooterContent {
  description: string
  email: string
  phone: string
  address: string
  groups: FooterGroup[]
}

export interface HomeContent {
  slides: HomeSlide[]
  banners: HomeBanner[]
  footer: FooterContent
  footerGroups: FooterGroupRecord[]
}
