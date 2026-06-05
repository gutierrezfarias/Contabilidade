import type { FooterContent, HomeBanner, HomeSlide } from '../types/home'

export const homeSlides: HomeSlide[] = [
  {
    id: 'slide-foco',
    eyebrow: 'Controle pessoal',
    title: 'Planeje hoje. Avance todos os dias.',
    description:
      'Centralize compromissos, objetivos e indicadores em uma experiência simples e elegante.',
    theme: 'focus',
  },
  {
    id: 'slide-equilibrio',
    eyebrow: 'Rotina inteligente',
    title: 'Organização que cabe na sua vida.',
    description:
      'Acompanhe hábitos, finanças e prioridades com uma visão clara do que importa agora.',
    theme: 'balance',
  },
  {
    id: 'slide-evolucao',
    eyebrow: 'Resultados visíveis',
    title: 'Transforme progresso em constância.',
    description:
      'Descubra seus avanços com resumos visuais e mantenha o ritmo das suas metas.',
    theme: 'growth',
  },
]

export const homeBanners: HomeBanner[] = [
  {
    id: 'agenda',
    category: 'Agenda',
    title: 'Semana organizada',
    description: 'Visualize tarefas e prioridades em um só lugar.',
  },
  {
    id: 'financas',
    category: 'Finanças',
    title: 'Escolhas conscientes',
    description: 'Monitore objetivos e decisões importantes.',
  },
  {
    id: 'habitos',
    category: 'Hábitos',
    title: 'Rotinas consistentes',
    description: 'Acompanhe sua evolução de forma leve.',
  },
  {
    id: 'insights',
    category: 'Insights',
    title: 'Dados claros',
    description: 'Indicadores que ajudam você a avançar.',
  },
]

export const footerContent: FooterContent = {
  description:
    'Sua plataforma pessoal para organizar a rotina, acompanhar objetivos e tomar decisões com tranquilidade.',
  email: 'contato@aurorapersonal.com',
  phone: '(11) 4000-1234',
  address: 'São Paulo, Brasil',
  groups: [
    {
      title: 'Plataforma',
      links: ['Dashboard', 'Recursos', 'Indicadores', 'Segurança'],
    },
    {
      title: 'Suporte',
      links: ['Central de ajuda', 'Contato', 'Privacidade', 'Termos de uso'],
    },
  ],
}

// Esta fonte mockada poderá ser trocada por dados gerenciados no Admin "home".
