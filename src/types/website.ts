export interface WebsiteTemplate {
  id: string
  name: string
  description: string
  previewImage: string
  layoutKey: string
  active: boolean
}

export interface WebsiteSite {
  organizationId: string
  templateId: string
  siteName: string
  domain: string
  headline: string
  subtitle: string
  aboutText: string
  servicesText: string
  primaryColor: string
  logoData: string
  heroImageData: string
  published: boolean
  updatedAt: string
}
