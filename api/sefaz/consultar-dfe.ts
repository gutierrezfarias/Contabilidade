/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'
import { Buffer } from 'node:buffer'
import https from 'node:https'
import process from 'node:process'
import { gunzipSync } from 'node:zlib'

type VercelRequest = {
  body?: unknown
  headers: Record<string, string | string[] | undefined>
  method?: string
}

type VercelResponse = {
  json: (body: unknown) => void
  status: (code: number) => VercelResponse
}

type ConsultationPayload = {
  certificateId?: string
  clientId?: string
  direction?: 'recebida' | 'emitida' | 'transporte' | 'citada'
  organizationId?: string
  queryType?: 'summary' | 'complete'
}

type BackendDocument = {
  accessKey?: string
  amount?: number
  danfeUrl?: string
  description?: string
  issueDate?: string
  number?: string
  operationType?: string
  recipientDocument?: string
  recipientName?: string
  series?: string
  status?: string
  xmlUrl?: string
}

type DirectSefazDocument = BackendDocument & {
  destinationDocument?: string
  destinationName?: string
  documentDirection?: string
  documentModel?: string
  emitterDocument?: string
  emitterName?: string
  manifestationDeadline?: string
  manifestationStatus?: string
  nsu?: string
  protocolNumber?: string
  rawSummary?: Record<string, unknown>
  rawXml?: string
  sefazStatusCode?: string
}

type DirectSefazResult = {
  documents: DirectSefazDocument[]
  lastNsu: string
  maxNsu: string
  message: string
  statusCode: string
  statusMessage: string
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
const sefazBackendUrl = process.env.SEFAZ_BACKEND_URL
const sefazBackendToken = process.env.SEFAZ_BACKEND_TOKEN
const nfeDistributionSoapAction =
  'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse'

const ufCodes: Record<string, string> = {
  AC: '12',
  AL: '27',
  AM: '13',
  AP: '16',
  BA: '29',
  CE: '23',
  DF: '53',
  ES: '32',
  GO: '52',
  MA: '21',
  MG: '31',
  MS: '50',
  MT: '51',
  PA: '15',
  PB: '25',
  PE: '26',
  PI: '22',
  PR: '41',
  RJ: '33',
  RN: '24',
  RO: '11',
  RR: '14',
  RS: '43',
  SC: '42',
  SE: '28',
  SP: '35',
  TO: '17',
}

function getHeader(req: VercelRequest, name: string) {
  const value = Object.entries(req.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function parseBody(body: unknown): ConsultationPayload {
  if (typeof body === 'string') {
    return JSON.parse(body) as ConsultationPayload
  }

  return (body ?? {}) as ConsultationPayload
}

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Configure SUPABASE_SERVICE_ROLE_KEY e VITE_SUPABASE_URL na Vercel.')
  }

  return createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
}

async function requireUser(req: VercelRequest) {
  const supabase = getSupabase()
  const authorization = getHeader(req, 'authorization')
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim()

  if (!accessToken) {
    throw new Error('Login obrigatorio para consultar a SEFAZ.')
  }

  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data.user) {
    throw new Error('Sessao invalida. Entre novamente.')
  }

  return { supabase, userId: data.user.id }
}

async function ensureOrganizationAccess(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  organizationId: string,
) {
  const [{ data: role }, { data: member }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
    supabase
      .from('organization_members')
      .select('organization_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (role?.role !== 'admin' && !member) {
    throw new Error('Voce nao tem acesso a esta empresa.')
  }
}

function mapBackendStatus(status: string | undefined) {
  if (status === 'Autorizada' || status === 'Cancelada' || status === 'Rejeitada') return status
  if (status === 'Consultada') return 'Consultada'
  return 'Consultada'
}

function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

function leftPadNsu(value: string) {
  return onlyDigits(value).padStart(15, '0').slice(-15)
}

function normalizeSefazBackendUrl(value: string | undefined) {
  const url = String(value ?? '').trim()
  if (!url || /example\.com|sua-api|seu-backend|api-fiscal/i.test(url)) return ''
  return url.replace(/\/$/, '')
}

function getCertificateBuffer(fileData: string) {
  const base64 = fileData.includes(',') ? fileData.split(',').pop() ?? '' : fileData
  return Buffer.from(base64, 'base64')
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function xmlValue(xml: string, tag: string) {
  const match = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`).exec(xml)
  return match?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() ?? ''
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function normalizeSefazResponse(value: string) {
  return decodeXmlEntities(value)
}

function compactResponsePreview(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

function soapFaultMessage(xml: string) {
  return (
    xmlValue(xml, 'faultstring') ||
    xmlValue(xml, 'Text') ||
    xmlValue(xml, 'Reason') ||
    xmlValue(xml, 'faultcode')
  )
}

function xmlBlock(xml: string, tag: string) {
  const match = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`).exec(xml)
  return match?.[0] ?? ''
}

function dateOnly(value: string) {
  if (!value) return ''
  return value.slice(0, 10)
}

function addDays(date: string, days: number) {
  if (!date) return ''
  const parsedDate = new Date(date)
  if (Number.isNaN(parsedDate.getTime())) return ''
  parsedDate.setDate(parsedDate.getDate() + days)
  return parsedDate.toISOString().slice(0, 10)
}

function classifyDirection(clientTaxId: string, document: DirectSefazDocument, fallback: string) {
  const clientDigits = onlyDigits(clientTaxId)
  if (document.emitterDocument && onlyDigits(document.emitterDocument) === clientDigits) return 'emitida'
  if (document.destinationDocument && onlyDigits(document.destinationDocument) === clientDigits) return 'recebida'
  return fallback
}

function numberFromAccessKey(accessKey: string) {
  const number = accessKey.length === 44 ? accessKey.slice(25, 34).replace(/^0+/, '') : ''
  return number || ''
}

function seriesFromAccessKey(accessKey: string) {
  const series = accessKey.length === 44 ? accessKey.slice(22, 25).replace(/^0+/, '') : ''
  return series || ''
}

function statusFromSituation(value: string) {
  if (value === '1' || value === '100') return 'Autorizada'
  if (value === '3' || value === '101' || value === '135' || value === '155') return 'Cancelada'
  if (value === '2' || value === '110' || value === '301' || value === '302') return 'Rejeitada'
  return 'Consultada'
}

function parseNfeDocumentFromXml(xml: string, nsu: string, schema: string, clientTaxId: string, fallbackDirection: string) {
  const accessKey = xmlValue(xml, 'chNFe')
  if (!accessKey) return null
  const isSummary = /resNFe/i.test(schema) || /<(?:\w+:)?resNFe/i.test(xml)
  const emitBlock = xmlBlock(xml, 'emit')
  const destBlock = xmlBlock(xml, 'dest')
  const issueDate = dateOnly(xmlValue(xml, 'dhEmi') || xmlValue(xml, 'dEmi'))
  const situation = xmlValue(xml, 'cSitNFe') || xmlValue(xml, 'cStat')

  const document: DirectSefazDocument = {
    accessKey,
    amount: Number(xmlValue(xml, 'vNF').replace(',', '.') || 0),
    description: xmlValue(xml, 'natOp') || schema,
    destinationDocument: '',
    destinationName: '',
    documentDirection: fallbackDirection,
    documentModel: schema.includes('res') ? 'Resumo NF-e' : 'NF-e',
    emitterDocument: '',
    emitterName: xmlValue(xml, 'xNome'),
    issueDate,
    manifestationDeadline: addDays(issueDate, 180),
    manifestationStatus: 'Pendente',
    nsu,
    number: xmlValue(xml, 'nNF') || numberFromAccessKey(accessKey),
    operationType: xmlValue(xml, 'tpNF') === '1' ? 'Saida' : 'Entrada',
    protocolNumber: xmlValue(xml, 'nProt'),
    rawSummary: {
      cSitNFe: situation,
      schema,
      xMotivo: xmlValue(xml, 'xMotivo'),
    },
    rawXml: xml,
    recipientDocument: '',
    recipientName: '',
    series: xmlValue(xml, 'serie') || seriesFromAccessKey(accessKey),
    sefazStatusCode: situation,
    status: statusFromSituation(situation),
  }

  if (isSummary) {
    document.emitterDocument = xmlValue(xml, 'CNPJ') || xmlValue(xml, 'CPF')
    document.emitterName = xmlValue(xml, 'xNome') || document.emitterName
  } else {
    document.emitterDocument = xmlValue(emitBlock, 'CNPJ') || xmlValue(emitBlock, 'CPF') || document.emitterDocument
    document.emitterName = xmlValue(emitBlock, 'xNome') || document.emitterName
    document.destinationDocument = xmlValue(destBlock, 'CNPJ') || xmlValue(destBlock, 'CPF') || document.destinationDocument
    document.destinationName = xmlValue(destBlock, 'xNome') || ''
  }

  document.recipientDocument = document.destinationDocument
  document.recipientName = document.destinationName || document.emitterName || ''
  document.documentDirection = classifyDirection(clientTaxId, document, fallbackDirection)

  return document
}

function decodeDocZip(responseXml: string, clientTaxId: string, fallbackDirection: string) {
  const documents: DirectSefazDocument[] = []
  const regex = /<(?:\w+:)?docZip([^>]*)>([\s\S]*?)<\/(?:\w+:)?docZip>/g
  let match = regex.exec(responseXml)

  while (match) {
    const attrs = match[1] ?? ''
    const nsu = /NSU="([^"]*)"/i.exec(attrs)?.[1] ?? ''
    const schema = /schema="([^"]*)"/i.exec(attrs)?.[1] ?? ''
    const zipped = match[2]?.trim() ?? ''

    try {
      const xml = gunzipSync(Buffer.from(zipped, 'base64')).toString('utf8')
      const document = parseNfeDocumentFromXml(xml, nsu, schema, clientTaxId, fallbackDirection)
      if (document) documents.push(document)
    } catch {
      // Ignora documento individual ilegivel e mantem a consulta funcionando.
    }

    match = regex.exec(responseXml)
  }

  return documents
}

function buildDistributionSoap(input: {
  cnpj: string
  environment: string
  lastNsu: string
  stateUf: string
}) {
  const tpAmb = input.environment === 'producao' ? '1' : '2'
  const cUFAutor = ufCodes[input.stateUf.toUpperCase()] ?? '35'
  const distDFe = [
    '<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">',
    `<tpAmb>${tpAmb}</tpAmb>`,
    `<cUFAutor>${cUFAutor}</cUFAutor>`,
    `<CNPJ>${escapeXml(input.cnpj)}</CNPJ>`,
    '<distNSU>',
    `<ultNSU>${leftPadNsu(input.lastNsu)}</ultNSU>`,
    '</distNSU>',
    '</distDFeInt>',
  ].join('')

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '<soap:Body>',
    '<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">',
    `<nfeDadosMsg>${distDFe}</nfeDadosMsg>`,
    '</nfeDistDFeInteresse>',
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('')
}

function sefazDistributionEndpoint(environment: string) {
  return environment === 'producao'
    ? 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
    : 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
}

function postSoapWithCertificate(input: {
  body: string
  certificateFileData: string
  certificatePassword: string
  environment: string
}) {
  const url = new URL(sefazDistributionEndpoint(input.environment))
  const payload = Buffer.from(input.body, 'utf8')

  return new Promise<string>((resolve, reject) => {
    const request = https.request(
      {
        headers: {
          'content-length': String(payload.length),
          SOAPAction: `"${nfeDistributionSoapAction}"`,
          'content-type': 'text/xml; charset=utf-8',
        },
        hostname: url.hostname,
        method: 'POST',
        passphrase: input.certificatePassword,
        path: url.pathname,
        pfx: getCertificateBuffer(input.certificateFileData),
        port: 443,
        rejectUnauthorized: true,
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(`SEFAZ retornou HTTP ${response.statusCode}: ${text.slice(0, 300)}`))
            return
          }
          resolve(normalizeSefazResponse(text))
        })
      },
    )

    request.on('error', reject)
    request.write(payload)
    request.end()
  })
}

async function getSyncState(
  supabase: ReturnType<typeof createClient>,
  payload: Required<Pick<ConsultationPayload, 'certificateId' | 'clientId' | 'organizationId'>> & {
    direction: string
    environment: string
    stateUf: string
    queryType: string
  },
) {
  const { data, error } = await supabase
    .from('sefaz_sync_state')
    .select('*')
    .eq('organization_id', payload.organizationId)
    .eq('client_id', payload.clientId)
    .eq('certificate_id', payload.certificateId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) throw error
  const existing = data?.[0]

  if (existing) {
    const mustResetNsu =
      payload.queryType === 'complete' ||
      String(existing.environment ?? '') !== payload.environment ||
      String(existing.state_uf ?? '').toUpperCase() !== payload.stateUf.toUpperCase()

    if (!mustResetNsu) return existing

    const { data: updated, error: updateError } = await supabase
      .from('sefaz_sync_state')
      .update({
        document_direction: 'recebida',
        environment: payload.environment,
        last_error_message: '',
        last_nsu: '000000000000000',
        last_status_code: '',
        last_status_message: '',
        max_nsu: '000000000000000',
        state_uf: payload.stateUf,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (updateError) throw updateError
    return updated
  }

  const { data: inserted, error: insertError } = await supabase
    .from('sefaz_sync_state')
    .insert({
      certificate_id: payload.certificateId,
      client_id: payload.clientId,
      document_direction: 'recebida',
      environment: payload.environment,
      organization_id: payload.organizationId,
      state_uf: payload.stateUf,
    })
    .select('*')
    .single()

  if (insertError) throw insertError
  return inserted
}

async function saveDirectDocuments(
  supabase: ReturnType<typeof createClient>,
  input: {
    certificateId: string
    clientId: string
    documents: DirectSefazDocument[]
    organizationId: string
  },
) {
  let saved = 0

  for (const document of input.documents) {
    if (!document.accessKey) continue

    const row = {
      access_key: document.accessKey,
      amount: Number(document.amount ?? 0),
      certificate_id: input.certificateId,
      client_id: input.clientId,
      danfe_url: document.danfeUrl ?? null,
      description: document.description ?? '',
      destination_document: document.destinationDocument ?? '',
      destination_name: document.destinationName ?? '',
      document_direction: document.documentDirection ?? 'recebida',
      document_model: document.documentModel ?? 'NFe',
      emitter_document: document.emitterDocument ?? '',
      emitter_name: document.emitterName ?? '',
      issue_date: document.issueDate || new Date().toISOString().slice(0, 10),
      last_consulted_at: new Date().toISOString(),
      manifestation_deadline: document.manifestationDeadline || null,
      manifestation_status: document.manifestationStatus ?? 'Pendente',
      nsu: document.nsu ?? '',
      number: document.number ?? '',
      operation_type: document.operationType ?? 'Consulta DF-e',
      organization_id: input.organizationId,
      protocol_number: document.protocolNumber ?? '',
      raw_summary: document.rawSummary ?? {},
      raw_xml: document.rawXml ?? null,
      recipient_document: document.recipientDocument ?? document.destinationDocument ?? '',
      recipient_name: document.recipientName ?? document.destinationName ?? '',
      sefaz_status_code: document.sefazStatusCode ?? '',
      series: document.series ?? '',
      status: mapBackendStatus(document.status),
      xml_url: document.xmlUrl ?? null,
    }

    const { data: existing } = await supabase
      .from('nfe_documents')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('access_key', document.accessKey)
      .maybeSingle()

    const { error } = existing?.id
      ? await supabase.from('nfe_documents').update(row).eq('id', existing.id)
      : await supabase.from('nfe_documents').insert(row)

    if (error) throw error
    saved += 1
  }

  return saved
}

async function consultDirectSefaz(
  supabase: ReturnType<typeof createClient>,
  payload: {
    certificate: Record<string, unknown>
    certificateId: string
    client: Record<string, unknown>
    clientId: string
    direction: string
    organizationId: string
    queryType: string
  },
): Promise<DirectSefazResult> {
  const clientTaxId = onlyDigits(payload.client.cnpj || payload.certificate.tax_id)
  const stateUf = String(payload.certificate.state_uf || payload.client.state || 'SP').toUpperCase()
  const environment = String(payload.certificate.environment ?? 'homologacao')

  if (clientTaxId.length !== 14) {
    throw new Error('O cliente/certificado precisa ter CNPJ com 14 digitos para consultar DF-e.')
  }

  const syncState = await getSyncState(supabase, {
    certificateId: payload.certificateId,
    clientId: payload.clientId,
    direction: payload.direction,
    environment,
    organizationId: payload.organizationId,
    queryType: payload.queryType,
    stateUf,
  })

  const responseXml = await postSoapWithCertificate({
    body: buildDistributionSoap({
      cnpj: clientTaxId,
      environment,
      lastNsu: String(syncState.last_nsu ?? '000000000000000'),
      stateUf,
    }),
    certificateFileData: String(payload.certificate.certificate_file_data),
    certificatePassword: String(payload.certificate.certificate_password),
    environment,
  })

  const statusCode = xmlValue(responseXml, 'cStat')
  const statusMessage = xmlValue(responseXml, 'xMotivo')
  const lastNsu = leftPadNsu(xmlValue(responseXml, 'ultNSU') || syncState.last_nsu)
  const maxNsu = leftPadNsu(xmlValue(responseXml, 'maxNSU') || syncState.max_nsu)
  const documents = decodeDocZip(responseXml, clientTaxId, payload.direction)

  if (!statusCode) {
    const fault = soapFaultMessage(responseXml)
    const preview = compactResponsePreview(responseXml)
    const diagnosticMessage = fault
      ? `A SEFAZ retornou falha SOAP: ${fault}.`
      : `A SEFAZ nao retornou cStat. Resposta: ${preview || 'vazia'}.`

    await supabase
      .from('sefaz_sync_state')
      .update({
        last_error_at: new Date().toISOString(),
        last_error_message: diagnosticMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', syncState.id)

    throw new Error(diagnosticMessage)
  }

  await saveDirectDocuments(supabase, {
    certificateId: payload.certificateId,
    clientId: payload.clientId,
    documents,
    organizationId: payload.organizationId,
  })

  await supabase
    .from('sefaz_sync_state')
    .update({
      last_error_message: '',
      last_nsu: lastNsu,
      last_status_code: statusCode,
      last_status_message: statusMessage,
      last_success_at: new Date().toISOString(),
      max_nsu: maxNsu,
      updated_at: new Date().toISOString(),
    })
    .eq('id', syncState.id)

  return {
    documents,
    lastNsu,
    maxNsu,
    message: statusMessage || `${documents.length} documento(s) retornado(s) pela SEFAZ.`,
    statusCode,
    statusMessage,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const { supabase, userId } = await requireUser(req)
    const payload = parseBody(req.body)
    const organizationId = String(payload.organizationId ?? '')
    const clientId = String(payload.clientId ?? '')
    const certificateId = String(payload.certificateId ?? '')
    const direction = String(payload.direction ?? 'recebida') as NonNullable<ConsultationPayload['direction']>

    if (!organizationId || !clientId || !certificateId) {
      return res.status(400).json({ ok: false, error: 'Informe cliente, organizacao e certificado.' })
    }

    await ensureOrganizationAccess(supabase, userId, organizationId)

    const { data: certificate, error: certificateError } = await supabase
      .from('digital_certificates')
      .select('*')
      .eq('id', certificateId)
      .eq('client_id', clientId)
      .eq('organization_id', organizationId)
      .single()

    if (certificateError || !certificate) {
      return res.status(404).json({ ok: false, error: 'Certificado nao encontrado para este cliente.' })
    }

    if (!certificate.certificate_file_data || !certificate.certificate_password) {
      return res.status(400).json({
        ok: false,
        error: 'O certificado precisa ter arquivo PFX/P12 e senha cadastrados para consultar a SEFAZ.',
      })
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('organization_id', organizationId)
      .single()

    if (clientError || !client) {
      return res.status(404).json({ ok: false, error: 'Cliente nao encontrado para consultar DF-e.' })
    }

    const externalBackendUrl = normalizeSefazBackendUrl(sefazBackendUrl)

    if (!externalBackendUrl) {
      const directResult = await consultDirectSefaz(supabase, {
        certificate,
        certificateId,
        client,
        clientId,
        direction,
        organizationId,
        queryType: payload.queryType ?? 'summary',
      })

      return res.status(200).json({
        ok: true,
        documentsImported: directResult.documents.length,
        lastNsu: directResult.lastNsu,
        maxNsu: directResult.maxNsu,
        message:
          directResult.documents.length > 0
            ? `${directResult.documents.length} documento(s) retornado(s). ${directResult.message}`
            : directResult.message || 'Consulta concluida sem novos documentos.',
        statusCode: directResult.statusCode,
        statusMessage: directResult.statusMessage,
      })
    }

    const backendResponse = await fetch(`${externalBackendUrl}/consultar-dfe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(sefazBackendToken ? { authorization: `Bearer ${sefazBackendToken}` } : {}),
      },
      body: JSON.stringify({
        certificate: {
          environment: certificate.environment,
          fileData: certificate.certificate_file_data,
          password: certificate.certificate_password,
          stateUf: certificate.state_uf,
          taxId: certificate.tax_id,
        },
        clientId,
        direction,
        organizationId,
        queryType: payload.queryType ?? 'summary',
      }),
    })
    const backendResult = (await backendResponse.json().catch(() => ({}))) as {
      documents?: BackendDocument[]
      error?: string
      message?: string
    }

    if (!backendResponse.ok) {
      return res.status(backendResponse.status).json({
        ok: false,
        error: backendResult.error ?? 'Backend fiscal recusou a consulta SEFAZ.',
      })
    }

    const documents = backendResult.documents ?? []

    for (const document of documents) {
      await supabase.from('nfe_documents').insert({
        organization_id: organizationId,
        client_id: clientId,
        certificate_id: certificateId,
        access_key: document.accessKey ?? '',
        amount: Number(document.amount ?? 0),
        danfe_url: document.danfeUrl ?? null,
        description: document.description ?? '',
        issue_date: document.issueDate ?? new Date().toISOString().slice(0, 10),
        number: document.number ?? '',
        operation_type: document.operationType ?? 'Consulta DF-e',
        recipient_document: document.recipientDocument ?? '',
        recipient_name: document.recipientName ?? '',
        series: document.series ?? '',
        status: mapBackendStatus(document.status),
        xml_url: document.xmlUrl ?? null,
      })
    }

    return res.status(200).json({
      ok: true,
      documentsImported: documents.length,
      message: backendResult.message ?? `${documents.length} documento(s) retornado(s) pela SEFAZ.`,
    })
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Nao foi possivel consultar a SEFAZ.',
    })
  }
}
