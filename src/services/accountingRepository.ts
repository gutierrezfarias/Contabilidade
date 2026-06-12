import { supabase } from './supabase'
import type {
  AccountingClient,
  AccountingClientDocument,
  AccountingPeriod,
  CertificateService,
  ClientMonthlyPayment,
  DigitalCertificate,
  FiscalObligation,
  PaymentStatus,
} from '../types/accounting'
import { formatCnpj, formatPhone, formatPostalCode } from '../utils/formatters'

type ClientInput = Omit<AccountingClient, 'id' | 'organizationId' | 'active'>
type CertificateInput = Omit<DigitalCertificate, 'id'>
type ClientDocumentInput = Omit<AccountingClientDocument, 'id' | 'organizationId' | 'clientId' | 'createdAt'>

function fail(error: { message: string } | null, fallback: string) {
  if (error) {
    throw new Error(
      error.message.includes('does not exist') ||
        error.message.includes('schema cache') ||
        error.message.includes('Could not find')
        ? 'Banco contabil incompleto no Supabase. Rode primeiro a migration 20260602_accounting_core_repair.sql. Ela cria/repara clients, pagamentos, certificados, documentos e politicas RLS.'
        : fallback,
    )
  }
}

function datePtBr(value: string) {
  const [year, month, day] = value.split('-')
  return day && month && year ? `${day}/${month}/${year}` : value
}

function normalizeClientInput(input: ClientInput) {
  return {
    ...input,
    cnpj: formatCnpj(input.cnpj),
    phone: formatPhone('BR', input.phone),
    cep: formatPostalCode('BR', input.cep),
    addressComplement: input.addressComplement,
    addressNumber: input.addressNumber,
    cityIbgeCode: input.cityIbgeCode,
    neighborhood: input.neighborhood,
    city: input.city,
    state: input.state,
    municipalRegistration: input.municipalRegistration,
    stateRegistration: input.stateRegistration,
    taxRegime: input.taxRegime || 'Nao informado',
    companySize: input.companySize || 'Nao informado',
    mainCnae: input.mainCnae || '',
    legalNature: input.legalNature || '',
    monthlyFee: Number(input.monthlyFee || 0),
    photoData: input.photoData || undefined,
  }
}

function mapClient(row: Record<string, unknown>): AccountingClient {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    companyName: String(row.company_name),
    cnpj: String(row.cnpj),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    cep: String(row.cep ?? ''),
    address: String(row.address ?? ''),
    addressNumber: String(row.address_number ?? ''),
    addressComplement: String(row.address_complement ?? ''),
    neighborhood: String(row.neighborhood ?? ''),
    city: String(row.city ?? ''),
    state: String(row.state ?? ''),
    cityIbgeCode: String(row.city_ibge_code ?? ''),
    stateRegistration: String(row.state_registration ?? ''),
    municipalRegistration: String(row.municipal_registration ?? ''),
    taxRegime: String(row.tax_regime ?? 'Nao informado') as AccountingClient['taxRegime'],
    companySize: String(row.company_size ?? 'Nao informado') as AccountingClient['companySize'],
    mainCnae: String(row.main_cnae ?? ''),
    legalNature: String(row.legal_nature ?? ''),
    photoData: row.photo_data ? String(row.photo_data) : row.photo_url ? String(row.photo_url) : undefined,
    isMonthly: Boolean(row.is_monthly),
    monthlyFee: Number(row.monthly_fee ?? 0),
    active: Boolean(row.active),
  }
}

function mapClientDocument(row: Record<string, unknown>): AccountingClientDocument {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    clientId: String(row.client_id),
    fileName: String(row.file_name ?? ''),
    mimeType: String(row.mime_type ?? ''),
    fileSize: Number(row.file_size ?? 0),
    fileData: String(row.file_data ?? ''),
    documentType: String(row.document_type ?? 'Documento'),
    extractedCnpj: String(row.extracted_cnpj ?? ''),
    createdAt: String(row.created_at ?? ''),
  }
}

export async function listAccountingClients(organizationId: string | null) {
  if (!organizationId) {
    return []
  }

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  fail(error, 'Nao foi possivel carregar os clientes.')
  return (data ?? []).map((client) => mapClient(client))
}

export async function createAccountingClient(organizationId: string, input: ClientInput) {
  const client = normalizeClientInput(input)
  const { data, error } = await supabase
    .from('clients')
    .insert({
      organization_id: organizationId,
      company_name: client.companyName,
      cnpj: client.cnpj,
      phone: client.phone,
      email: client.email,
      cep: client.cep,
      address: client.address,
      address_number: client.addressNumber,
      address_complement: client.addressComplement,
      neighborhood: client.neighborhood,
      city: client.city,
      state: client.state,
      city_ibge_code: client.cityIbgeCode,
      state_registration: client.stateRegistration,
      municipal_registration: client.municipalRegistration,
      tax_regime: client.taxRegime,
      company_size: client.companySize,
      main_cnae: client.mainCnae,
      legal_nature: client.legalNature,
      photo_data: client.photoData ?? null,
      is_monthly: client.isMonthly,
      monthly_fee: client.monthlyFee,
    })
    .select('id')
    .single()

  fail(error, 'Nao foi possivel cadastrar o cliente.')
  if (!data?.id) {
    throw new Error('Cliente cadastrado, mas nao foi possivel localizar o identificador.')
  }

  return String(data.id)
}

export async function updateAccountingClient(clientId: string, input: ClientInput) {
  const client = normalizeClientInput(input)
  const { error } = await supabase
    .from('clients')
    .update({
      company_name: client.companyName,
      cnpj: client.cnpj,
      phone: client.phone,
      email: client.email,
      cep: client.cep,
      address: client.address,
      address_number: client.addressNumber,
      address_complement: client.addressComplement,
      neighborhood: client.neighborhood,
      city: client.city,
      state: client.state,
      city_ibge_code: client.cityIbgeCode,
      state_registration: client.stateRegistration,
      municipal_registration: client.municipalRegistration,
      tax_regime: client.taxRegime,
      company_size: client.companySize,
      main_cnae: client.mainCnae,
      legal_nature: client.legalNature,
      photo_data: client.photoData ?? null,
      is_monthly: client.isMonthly,
      monthly_fee: client.monthlyFee,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId)

  fail(error, 'Nao foi possivel atualizar o cliente.')
}

export async function deleteAccountingClient(clientId: string) {
  const { error } = await supabase.from('clients').delete().eq('id', clientId)
  fail(error, 'Nao foi possivel excluir o cliente.')
}

export async function createClientDocument(
  organizationId: string,
  clientId: string,
  document: ClientDocumentInput,
) {
  const { error } = await supabase.from('client_documents').insert({
    organization_id: organizationId,
    client_id: clientId,
    document_type: document.documentType,
    extracted_cnpj: document.extractedCnpj,
    file_data: document.fileData,
    file_name: document.fileName,
    file_size: document.fileSize,
    mime_type: document.mimeType,
  })

  fail(error, 'Cliente salvo, mas nao foi possivel vincular o documento importado.')
}

export async function listClientDocuments(clientId: string | null) {
  if (!clientId) return []

  const { data, error } = await supabase
    .from('client_documents')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  fail(error, 'Nao foi possivel carregar documentos do cliente.')
  return (data ?? []).map((document) => mapClientDocument(document))
}

export async function deleteClientDocument(documentId: string) {
  const { error } = await supabase.from('client_documents').delete().eq('id', documentId)
  fail(error, 'Nao foi possivel excluir o documento.')
}

export async function listClientPayments(
  organizationId: string | null,
  month: number,
  year: number,
) {
  if (!organizationId) {
    return []
  }

  const { data, error } = await supabase
    .from('client_payments')
    .select('*, clients(company_name)')
    .eq('organization_id', organizationId)
    .eq('competence_month', month)
    .eq('competence_year', year)
    .order('due_date', { ascending: false })

  fail(error, 'Nao foi possivel carregar os pagamentos.')
  return (data ?? []).map((payment) => ({
    id: payment.id,
    organizationId: payment.organization_id,
    clientId: payment.client_id,
    clientName: payment.clients?.company_name ?? 'Cliente',
    month: payment.competence_month,
    year: payment.competence_year,
    amount: Number(payment.amount),
    dueDate: datePtBr(payment.due_date),
    status: payment.status as PaymentStatus,
  } satisfies ClientMonthlyPayment))
}

export async function createClientPayment(
  organizationId: string,
  payment: Omit<ClientMonthlyPayment, 'id' | 'organizationId' | 'clientName'>,
) {
  const [day, month, year] = payment.dueDate.split('/')
  const { error } = await supabase.from('client_payments').insert({
    organization_id: organizationId,
    client_id: payment.clientId,
    competence_month: payment.month,
    competence_year: payment.year,
    amount: payment.amount,
    due_date: `${year}-${month}-${day}`,
    status: payment.status,
  })

  fail(error, 'Nao foi possivel importar o pagamento.')
}

export async function markPaymentPaid(paymentId: string) {
  const { error } = await supabase
    .from('client_payments')
    .update({ status: 'Pago', paid_at: new Date().toISOString() })
    .eq('id', paymentId)

  fail(error, 'Nao foi possivel atualizar o pagamento.')
}

export async function getAccountingPeriod(
  organizationId: string | null,
  month: number,
  year: number,
): Promise<AccountingPeriod> {
  const clients = await listAccountingClients(organizationId)
  const payments = await listClientPayments(organizationId, month, year)
  let obligations: FiscalObligation[] = []

  if (organizationId) {
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = `${year}-${String(month).padStart(2, '0')}-31`
    const { data, error } = await supabase
      .from('fiscal_obligations')
      .select('name, client_count, due_date, status')
      .eq('organization_id', organizationId)
      .gte('due_date', firstDay)
      .lte('due_date', lastDay)
      .order('due_date')

    fail(error, 'Nao foi possivel carregar as obrigacoes fiscais.')
    obligations = (data ?? []).map((item) => ({
      name: item.name,
      clientCount: item.client_count,
      dueDate: datePtBr(item.due_date),
      status: item.status === 'Concluido' ? 'Concluido' : item.status,
    })) as FiscalObligation[]
  }

  const paid = payments.filter((payment) => payment.status === 'Pago')
  const overdue = payments.filter((payment) => payment.status === 'Vencido')

  return {
    month,
    year,
    totalClients: clients.length,
    totalRevenue: paid.reduce((total, payment) => total + payment.amount, 0),
    clientsPaid: new Set(paid.map((payment) => payment.clientId)).size,
    clientsOverdue: new Set(overdue.map((payment) => payment.clientId)).size,
    monthlyGrowth: 0,
    recentPayments: payments.slice(0, 5),
    obligations,
  }
}

export async function listCertificates(clientId: string) {
  const { data, error } = await supabase
    .from('digital_certificates')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  fail(error, 'Nao foi possivel carregar os certificados.')
  return (data ?? []).map((certificate) => ({
    id: certificate.id,
    organizationId: certificate.organization_id,
    clientId: certificate.client_id,
    certificateType: certificate.certificate_type,
    holderName: certificate.holder_name,
    taxId: certificate.tax_id,
    validFrom: certificate.valid_from ?? '',
    validUntil: certificate.valid_until ?? '',
    status: certificate.status,
    serialNumber: certificate.serial_number ?? '',
    issuer: certificate.issuer ?? '',
    environment: certificate.environment ?? 'homologacao',
    stateUf: certificate.state_uf ?? '',
    municipalCode: certificate.municipal_code ?? '',
    secureReference: certificate.secure_reference ?? '',
    certificatePassword: certificate.certificate_password ?? '',
    certificateFileName: certificate.certificate_file_name ?? '',
    certificateFileSize: Number(certificate.certificate_file_size ?? 0),
    certificateFileData: certificate.certificate_file_data ? String(certificate.certificate_file_data) : undefined,
  })) as DigitalCertificate[]
}

export async function createCertificate(
  certificate: CertificateInput,
  enabledServices: CertificateService['serviceCode'][],
) {
  const { data, error } = await supabase
    .from('digital_certificates')
    .insert({
      organization_id: certificate.organizationId,
      client_id: certificate.clientId,
      certificate_type: certificate.certificateType,
      holder_name: certificate.holderName,
      tax_id: certificate.taxId,
      valid_from: certificate.validFrom || null,
      valid_until: certificate.validUntil || null,
      status: certificate.status,
      serial_number: certificate.serialNumber,
      issuer: certificate.issuer,
      environment: certificate.environment,
      state_uf: certificate.stateUf,
      municipal_code: certificate.municipalCode,
      secure_reference: certificate.secureReference,
      certificate_password: certificate.certificatePassword,
      certificate_file_name: certificate.certificateFileName,
      certificate_file_size: certificate.certificateFileSize,
      certificate_file_data: certificate.certificateFileData ?? null,
    })
    .select('id')
    .single()

  fail(error, 'Nao foi possivel cadastrar o certificado.')

  if (data && enabledServices.length) {
    const { error: serviceError } = await supabase.from('certificate_services').insert(
      enabledServices.map((serviceCode) => ({
        certificate_id: data.id,
        service_code: serviceCode,
        enabled: true,
        integration_status: 'Nao configurado',
      })),
    )
    fail(serviceError, 'Certificado salvo, mas nao foi possivel vincular os servicos.')
  }
}

export async function updateCertificate(
  certificateId: string,
  certificate: CertificateInput,
  enabledServices: CertificateService['serviceCode'][],
) {
  const { error } = await supabase
    .from('digital_certificates')
    .update({
      client_id: certificate.clientId,
      certificate_type: certificate.certificateType,
      holder_name: certificate.holderName,
      tax_id: certificate.taxId,
      valid_from: certificate.validFrom || null,
      valid_until: certificate.validUntil || null,
      status: certificate.status,
      serial_number: certificate.serialNumber,
      issuer: certificate.issuer,
      environment: certificate.environment,
      state_uf: certificate.stateUf,
      municipal_code: certificate.municipalCode,
      secure_reference: certificate.secureReference,
      certificate_password: certificate.certificatePassword,
      certificate_file_name: certificate.certificateFileName,
      certificate_file_size: certificate.certificateFileSize,
      certificate_file_data: certificate.certificateFileData ?? null,
    })
    .eq('id', certificateId)

  fail(error, 'Nao foi possivel atualizar o certificado.')

  const { error: deleteServicesError } = await supabase
    .from('certificate_services')
    .delete()
    .eq('certificate_id', certificateId)

  fail(deleteServicesError, 'Certificado atualizado, mas nao foi possivel atualizar os servicos.')

  if (enabledServices.length) {
    const { error: serviceError } = await supabase.from('certificate_services').insert(
      enabledServices.map((serviceCode) => ({
        certificate_id: certificateId,
        service_code: serviceCode,
        enabled: true,
        integration_status: 'Nao configurado',
      })),
    )
    fail(serviceError, 'Certificado atualizado, mas nao foi possivel vincular os servicos.')
  }
}

export async function listCertificateServices(certificateId: string) {
  const { data, error } = await supabase
    .from('certificate_services')
    .select('service_code')
    .eq('certificate_id', certificateId)

  fail(error, 'Nao foi possivel carregar os servicos do certificado.')
  return (data ?? []).map((service) => service.service_code) as CertificateService['serviceCode'][]
}

export async function replaceCertificateServices(
  certificateId: string,
  enabledServices: CertificateService['serviceCode'][],
) {
  const { error: deleteServicesError } = await supabase
    .from('certificate_services')
    .delete()
    .eq('certificate_id', certificateId)

  fail(deleteServicesError, 'Nao foi possivel limpar os servicos do certificado.')

  if (enabledServices.length === 0) return

  const uniqueServices = Array.from(new Set(enabledServices))
  const { error: serviceError } = await supabase.from('certificate_services').insert(
    uniqueServices.map((serviceCode) => ({
      certificate_id: certificateId,
      service_code: serviceCode,
      enabled: true,
      integration_status: 'Ativo',
    })),
  )

  fail(serviceError, 'Nao foi possivel ativar os servicos do certificado.')
}
