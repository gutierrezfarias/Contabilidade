import type { NfeConsultationResult, SefazServiceStatus } from '../types/sefaz'

export const sefazServices: SefazServiceStatus[] = [
  { name: 'NF-e', status: 'Online', message: 'Serviço disponível' },
  { name: 'NFC-e', status: 'Online', message: 'Serviço disponível' },
  { name: 'CT-e', status: 'Online', message: 'Serviço disponível' },
]

export async function consultNfeMock(clientName: string): Promise<NfeConsultationResult[]> {
  await new Promise((resolve) => window.setTimeout(resolve, 650))

  return [
    {
      id: 'nfe-001',
      clientName,
      documentNumber: '000.000.128',
      issueDate: '12/05/2026',
      amount: 'R$ 3.450,00',
      status: 'Autorizada',
    },
    {
      id: 'nfe-002',
      clientName,
      documentNumber: '000.000.129',
      issueDate: '19/05/2026',
      amount: 'R$ 1.120,00',
      status: 'Autorizada',
    },
  ]
}

// Fluxo demonstrativo. Uma integração real exigirá backend e certificado digital.
