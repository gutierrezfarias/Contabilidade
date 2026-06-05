import type { ApplicationItem } from '../types/apps'

export const applications: ApplicationItem[] = [
  {
    id: 'gestao-contabil',
    name: 'Sistema Gestao Contabil',
    description: 'Painel financeiro e acompanhamento de indicadores.',
    icon: 'accounting',
    status: 'requires-purchase',
    price: 'R$ 99,90/mes',
    route: '/dashboard',
  },
  {
    id: 'mini-crm',
    name: 'Mini CRM',
    description: 'Pipeline simples de leads, oportunidades e clientes.',
    icon: 'crm',
    status: 'requires-purchase',
    price: 'R$ 49,90/mes',
    route: '/mini-crm',
  },
  {
    id: 'omnichannel',
    name: 'Apps de Chats',
    description: 'Omnichannel para Telegram, WhatsApp, Instagram e Facebook.',
    icon: 'chat',
    status: 'requires-purchase',
    price: 'R$ 149,90/mes',
    route: '/omnichannel',
  },
  {
    id: 'crie-seu-site',
    name: 'Crie seu site',
    description: 'Construa a presenca digital do seu escritorio.',
    icon: 'website',
    status: 'requires-purchase',
    price: 'R$ 49,90/mes',
    route: '/aplicativos/crie-seu-site',
  },
  {
    id: 'psicologa-ia',
    name: 'Psicologa IA',
    description: 'Apoio inteligente para bem-estar e rotina.',
    icon: 'psychology',
    status: 'coming-soon',
    price: 'R$ 69,90/mes',
    route: '/aplicativos/psicologa-ia',
  },
  {
    id: 'cont-hub-completo',
    name: 'Pacote CONT HUB completo',
    description: 'Gestao Contabil, Mini CRM, Apps de Chats e Crie seu site com desconto.',
    icon: 'accounting',
    status: 'requires-purchase',
    price: 'R$ 249,90/mes',
    displayInCatalog: false,
    includedApplicationIds: ['gestao-contabil', 'mini-crm', 'omnichannel', 'crie-seu-site'],
  },
]

export const catalogApplications = applications.filter(
  (application) => application.displayInCatalog !== false,
)

export const purchasableApplications = applications.filter(
  (application) => application.status === 'requires-purchase',
)

export function getApplication(applicationId: string) {
  return applications.find((application) => application.id === applicationId)
}

export function formatMonthlyPrice(value: number) {
  return `${new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' }).format(value)}/mes`
}
