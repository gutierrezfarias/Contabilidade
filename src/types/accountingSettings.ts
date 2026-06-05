export interface AccountingCompanySettings {
  companyName: string
  logoData: string
  cep: string
  address: string
  addressComplement: string
  neighborhood: string
  city: string
  state: string
  phone: string
  whatsapp: string
  website: string
  openingHours: string
  businessDescription: string
  cnpj: string
  municipalRegistration: string
  stateRegistration: string
  articlesOfAssociation: string
  commercialAddressProof: string
  cnpjDocumentData: string
  cnpjDocumentName: string
  cnpjDocumentText: string
}

export interface CompanyPartner {
  id: string
  organizationId?: string
  name: string
  rg: string
  cnh: string
  cpf: string
  residenceProofData: string
  residenceProofName: string
  notes: string
}

export interface AccountingEmployee {
  id: string
  name: string
  role: string
  email: string
}

export interface HomeSettings {
  heroTitle: string
  heroDescription: string
  footerDescription: string
  footerEmail: string
  footerPhone: string
  footerAddress: string
}
