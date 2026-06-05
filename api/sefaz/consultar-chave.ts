/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'
import { Buffer } from 'node:buffer'
import https from 'node:https'
import process from 'node:process'

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
  accessKey?: string
  certificateId?: string
  clientId?: string
  organizationId?: string
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
const nfeConsultSoapAction =
  'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeConsultaNF'

const svrsProduction = 'https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx'
const svrsHomologation = 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx'

const consultationEndpoints: Record<string, { homologacao: string; producao: string }> = {
  BA: {
    homologacao: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
    producao: 'https://nfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
  },
  MG: {
    homologacao: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4',
    producao: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4',
  },
  MS: {
    homologacao: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeConsultaProtocolo4',
    producao: 'https://nfe.sefaz.ms.gov.br/ws/NFeConsultaProtocolo4',
  },
  MT: {
    homologacao: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeConsulta4',
    producao: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeConsulta4',
  },
  PE: {
    homologacao: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeConsultaProtocolo4',
    producao: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeConsultaProtocolo4',
  },
  PR: {
    homologacao: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeConsultaProtocolo4',
    producao: 'https://nfe.sefa.pr.gov.br/nfe/NFeConsultaProtocolo4',
  },
  RS: {
    homologacao: svrsHomologation,
    producao: svrsProduction,
  },
  SP: {
    homologacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
    producao: 'https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
  },
}

const cUfToUf: Record<string, string> = {
  '11': 'RO',
  '12': 'AC',
  '13': 'AM',
  '14': 'RR',
  '15': 'PA',
  '16': 'AP',
  '17': 'TO',
  '21': 'MA',
  '22': 'PI',
  '23': 'CE',
  '24': 'RN',
  '25': 'PB',
  '26': 'PE',
  '27': 'AL',
  '28': 'SE',
  '29': 'BA',
  '31': 'MG',
  '32': 'ES',
  '33': 'RJ',
  '35': 'SP',
  '41': 'PR',
  '42': 'SC',
  '43': 'RS',
  '50': 'MS',
  '51': 'MT',
  '52': 'GO',
  '53': 'DF',
}

function getHeader(req: VercelRequest, name: string) {
  const value = Object.entries(req.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function parseBody(body: unknown): ConsultationPayload {
  if (typeof body === 'string') return JSON.parse(body) as ConsultationPayload
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
    throw new Error('Login obrigatorio para consultar NF-e.')
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

function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
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

function compactResponsePreview(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

function accessKeyInfo(accessKey: string) {
  const cUf = accessKey.slice(0, 2)
  const year = Number(`20${accessKey.slice(2, 4)}`)
  const month = accessKey.slice(4, 6)
  return {
    cnpj: accessKey.slice(6, 20),
    cUf,
    issueDate: `${year}-${month}-01`,
    model: accessKey.slice(20, 22) === '55' ? 'NF-e' : `Modelo ${accessKey.slice(20, 22)}`,
    number: accessKey.slice(25, 34).replace(/^0+/, '') || accessKey.slice(25, 34),
    series: accessKey.slice(22, 25).replace(/^0+/, '') || accessKey.slice(22, 25),
    uf: cUfToUf[cUf] ?? '',
  }
}

function consultationEndpoint(cUf: string, environment: string) {
  const uf = cUfToUf[cUf] ?? ''
  const endpoints = consultationEndpoints[uf]
  if (endpoints) return endpoints[environment === 'producao' ? 'producao' : 'homologacao']
  return environment === 'producao' ? svrsProduction : svrsHomologation
}

function buildConsultSoap(accessKey: string, environment: string) {
  const tpAmb = environment === 'producao' ? '1' : '2'
  const consSit = [
    '<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">',
    `<tpAmb>${tpAmb}</tpAmb>`,
    '<xServ>CONSULTAR</xServ>',
    `<chNFe>${escapeXml(accessKey)}</chNFe>`,
    '</consSitNFe>',
  ].join('')

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '<soap:Body>',
    '<nfeConsultaNF xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4">',
    `<nfeDadosMsg>${consSit}</nfeDadosMsg>`,
    '</nfeConsultaNF>',
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('')
}

function postSoapWithCertificate(input: {
  accessKey: string
  body: string
  certificateFileData: string
  certificatePassword: string
  environment: string
}) {
  const url = new URL(consultationEndpoint(input.accessKey.slice(0, 2), input.environment))
  const payload = Buffer.from(input.body, 'utf8')

  return new Promise<string>((resolve, reject) => {
    const request = https.request(
      {
        headers: {
          SOAPAction: `"${nfeConsultSoapAction}"`,
          'content-length': String(payload.length),
          'content-type': 'text/xml; charset=utf-8',
        },
        hostname: url.hostname,
        method: 'POST',
        passphrase: input.certificatePassword,
        path: `${url.pathname}${url.search}`,
        pfx: getCertificateBuffer(input.certificateFileData),
        port: 443,
        rejectUnauthorized: true,
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          const text = decodeXmlEntities(Buffer.concat(chunks).toString('utf8'))
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(`SEFAZ retornou HTTP ${response.statusCode}: ${compactResponsePreview(text)}`))
            return
          }
          resolve(text)
        })
      },
    )

    request.on('error', reject)
    request.write(payload)
    request.end()
  })
}

function statusFromCode(code: string) {
  if (['100', '150'].includes(code)) return 'Autorizada'
  if (['101', '151', '155'].includes(code)) return 'Cancelada'
  if (['110', '301', '302', '303'].includes(code)) return 'Rejeitada'
  return 'Consultada'
}

async function saveConsultedDocument(
  supabase: ReturnType<typeof createClient>,
  input: {
    accessKey: string
    certificateId: string
    client: Record<string, unknown>
    clientId: string
    environment: string
    organizationId: string
    responseXml: string
    statusCode: string
    statusMessage: string
  },
) {
  const keyInfo = accessKeyInfo(input.accessKey)
  const clientTaxId = onlyDigits(input.client.cnpj)
  const isIssuedByClient = keyInfo.cnpj === clientTaxId
  const protocolBlock = xmlValue(input.responseXml, 'protNFe') ? input.responseXml : ''
  const protocolStatus = xmlValue(protocolBlock, 'cStat') || input.statusCode
  const protocolMessage = xmlValue(protocolBlock, 'xMotivo') || input.statusMessage
  const protocolNumber = xmlValue(protocolBlock, 'nProt')
  const protocolDate = xmlValue(protocolBlock, 'dhRecbto')
  const row = {
    access_key: input.accessKey,
    amount: 0,
    certificate_id: input.certificateId,
    client_id: input.clientId,
    danfe_url: null,
    description: protocolMessage || 'Consulta por chave de acesso',
    destination_document: isIssuedByClient ? '' : clientTaxId,
    destination_name: isIssuedByClient ? '' : String(input.client.company_name ?? ''),
    document_direction: isIssuedByClient ? 'emitida' : 'citada',
    document_model: keyInfo.model,
    emitter_document: keyInfo.cnpj,
    emitter_name: isIssuedByClient ? String(input.client.company_name ?? '') : '',
    issue_date: protocolDate?.slice(0, 10) || keyInfo.issueDate,
    last_consulted_at: new Date().toISOString(),
    manifestation_deadline: null,
    manifestation_status: 'Pendente',
    nsu: '',
    number: keyInfo.number,
    operation_type: 'Consulta por chave',
    organization_id: input.organizationId,
    protocol_number: protocolNumber,
    raw_summary: {
      accessKeyUf: keyInfo.uf,
      cStat: input.statusCode,
      endpoint: consultationEndpoint(keyInfo.cUf, input.environment),
      protocolStatus,
      xMotivo: input.statusMessage,
    },
    raw_xml: input.responseXml,
    recipient_document: isIssuedByClient ? '' : clientTaxId,
    recipient_name: isIssuedByClient ? '' : String(input.client.company_name ?? ''),
    sefaz_status_code: input.statusCode,
    series: keyInfo.series,
    status: statusFromCode(protocolStatus || input.statusCode),
    xml_url: null,
  }

  const { data: existing } = await supabase
    .from('nfe_documents')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('access_key', input.accessKey)
    .maybeSingle()

  const { error } = existing?.id
    ? await supabase.from('nfe_documents').update(row).eq('id', existing.id)
    : await supabase.from('nfe_documents').insert(row)

  if (error) throw error
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
    const accessKey = onlyDigits(payload.accessKey)

    if (!organizationId || !clientId || !certificateId || !accessKey) {
      return res.status(400).json({ ok: false, error: 'Informe cliente, certificado e chave de acesso.' })
    }

    if (accessKey.length !== 44) {
      return res.status(400).json({ ok: false, error: 'A chave de acesso da NF-e precisa ter 44 digitos.' })
    }

    await ensureOrganizationAccess(supabase, userId, organizationId)

    const [{ data: certificate, error: certificateError }, { data: client, error: clientError }] =
      await Promise.all([
        supabase
          .from('digital_certificates')
          .select('*')
          .eq('id', certificateId)
          .eq('client_id', clientId)
          .eq('organization_id', organizationId)
          .single(),
        supabase
          .from('clients')
          .select('*')
          .eq('id', clientId)
          .eq('organization_id', organizationId)
          .single(),
      ])

    if (certificateError || !certificate) {
      return res.status(404).json({ ok: false, error: 'Certificado nao encontrado para este cliente.' })
    }

    if (clientError || !client) {
      return res.status(404).json({ ok: false, error: 'Cliente nao encontrado para consultar NF-e.' })
    }

    if (!certificate.certificate_file_data || !certificate.certificate_password) {
      return res.status(400).json({
        ok: false,
        error: 'O certificado precisa ter arquivo PFX/P12 e senha cadastrados para consultar a SEFAZ.',
      })
    }

    const environment = String(certificate.environment ?? 'homologacao')
    const responseXml = await postSoapWithCertificate({
      accessKey,
      body: buildConsultSoap(accessKey, environment),
      certificateFileData: String(certificate.certificate_file_data),
      certificatePassword: String(certificate.certificate_password),
      environment,
    })
    const statusCode = xmlValue(responseXml, 'cStat')
    const statusMessage = xmlValue(responseXml, 'xMotivo')

    if (!statusCode) {
      return res.status(400).json({
        ok: false,
        error: `A SEFAZ nao retornou cStat. Resposta: ${compactResponsePreview(responseXml) || 'vazia'}.`,
      })
    }

    await saveConsultedDocument(supabase, {
      accessKey,
      certificateId,
      client,
      clientId,
      environment,
      organizationId,
      responseXml,
      statusCode,
      statusMessage,
    })

    return res.status(200).json({
      ok: true,
      accessKey,
      message: `NF-e consultada na SEFAZ: ${statusCode} - ${statusMessage || 'sem motivo retornado'}.`,
      statusCode,
      statusMessage,
    })
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Nao foi possivel consultar a NF-e por chave.',
    })
  }
}
