/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'
import { SignedXml } from 'xml-crypto'
import forge from 'node-forge'
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

type ManifestationPayload = {
  certificateId?: string
  clientId?: string
  documentId?: string
  eventType?: '210200' | '210210' | '210220' | '210240'
  justification?: string
  organizationId?: string
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY

const eventDescriptions: Record<NonNullable<ManifestationPayload['eventType']>, string> = {
  '210200': 'Confirmacao da Operacao',
  '210210': 'Ciencia da Operacao',
  '210220': 'Desconhecimento da Operacao',
  '210240': 'Operacao nao Realizada',
}

function getHeader(req: VercelRequest, name: string) {
  const value = Object.entries(req.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function parseBody(body: unknown): ManifestationPayload {
  if (typeof body === 'string') {
    return JSON.parse(body) as ManifestationPayload
  }

  return (body ?? {}) as ManifestationPayload
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
    throw new Error('Login obrigatorio para manifestar NF-e.')
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
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`).exec(xml)
  return match?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() ?? ''
}

function xmlValues(xml: string, tag: string) {
  return Array.from(xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'g')))
    .map((match) => match[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() ?? '')
    .filter(Boolean)
}

function extractPemFromPfx(fileData: string, password: string) {
  const pfxBuffer = getCertificateBuffer(fileData)
  const der = forge.util.createBuffer(pfxBuffer.toString('binary'))
  const asn1 = forge.asn1.fromDer(der)
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password)
  let privateKey: forge.pki.PrivateKey | null = null
  let certificate: forge.pki.Certificate | null = null

  for (const safeContent of p12.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      if (
        safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag ||
        safeBag.type === forge.pki.oids.keyBag
      ) {
        privateKey = safeBag.key ?? privateKey
      }

      if (safeBag.type === forge.pki.oids.certBag) {
        certificate = safeBag.cert ?? certificate
      }
    }
  }

  if (!privateKey || !certificate) {
    throw new Error('Nao foi possivel ler chave privada/certificado do PFX/P12.')
  }

  const privateKeyPem = forge.pki.privateKeyToPem(privateKey)
  const certificatePem = forge.pki.certificateToPem(certificate)
  const certificateBody = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '')

  return { certificateBody, certificatePem, privateKeyPem }
}

function eventEndpoint(environment: string) {
  return environment === 'producao'
    ? 'https://www1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx'
    : 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx'
}

function buildEventXml(input: {
  accessKey: string
  cnpj: string
  environment: string
  eventType: NonNullable<ManifestationPayload['eventType']>
  justification: string
}) {
  const tpAmb = input.environment === 'producao' ? '1' : '2'
  const eventDescription = eventDescriptions[input.eventType]
  const sequence = '1'
  const eventId = `ID${input.eventType}${input.accessKey}${sequence.padStart(2, '0')}`
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, '-03:00')
  const justification =
    input.eventType === '210240'
      ? `<xJust>${escapeXml(input.justification)}</xJust>`
      : ''

  return [
    '<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">',
    '<idLote>1</idLote>',
    '<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">',
    `<infEvento Id="${eventId}">`,
    '<cOrgao>91</cOrgao>',
    `<tpAmb>${tpAmb}</tpAmb>`,
    `<CNPJ>${escapeXml(input.cnpj)}</CNPJ>`,
    `<chNFe>${escapeXml(input.accessKey)}</chNFe>`,
    `<dhEvento>${now}</dhEvento>`,
    `<tpEvento>${input.eventType}</tpEvento>`,
    `<nSeqEvento>${sequence}</nSeqEvento>`,
    '<verEvento>1.00</verEvento>',
    '<detEvento versao="1.00">',
    `<descEvento>${eventDescription}</descEvento>`,
    justification,
    '</detEvento>',
    '</infEvento>',
    '</evento>',
    '</envEvento>',
  ].join('')
}

function signEventXml(xml: string, certificateFileData: string, certificatePassword: string) {
  const { certificateBody, privateKeyPem } = extractPemFromPfx(certificateFileData, certificatePassword)
  const signedXml = new SignedXml({
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    getKeyInfoContent: ({ prefix }) =>
      `<${prefix}:X509Data><${prefix}:X509Certificate>${certificateBody}</${prefix}:X509Certificate></${prefix}:X509Data>`,
    privateKey: privateKeyPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
  })

  signedXml.addReference({
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    xpath: "//*[local-name(.)='infEvento']",
  })
  signedXml.computeSignature(xml, {
    location: {
      action: 'after',
      reference: "//*[local-name(.)='infEvento']",
    },
    prefix: 'ds',
  })

  return signedXml.getSignedXml()
}

function buildSoapEnvelope(signedEventXml: string) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">',
    '<soap12:Body>',
    '<nfeRecepcaoEventoNF xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">',
    `<nfeDadosMsg>${signedEventXml}</nfeDadosMsg>`,
    '</nfeRecepcaoEventoNF>',
    '</soap12:Body>',
    '</soap12:Envelope>',
  ].join('')
}

function postSoapWithCertificate(input: {
  body: string
  certificateFileData: string
  certificatePassword: string
  environment: string
}) {
  const url = new URL(eventEndpoint(input.environment))
  const payload = Buffer.from(input.body, 'utf8')

  return new Promise<string>((resolve, reject) => {
    const request = https.request(
      {
        headers: {
          'content-length': String(payload.length),
          'content-type': 'application/soap+xml; charset=utf-8',
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
          resolve(text)
        })
      },
    )

    request.on('error', reject)
    request.write(payload)
    request.end()
  })
}

function manifestationStatus(eventType: NonNullable<ManifestationPayload['eventType']>) {
  if (eventType === '210200') return 'Confirmada'
  if (eventType === '210210') return 'Ciencia'
  if (eventType === '210220') return 'Desconhecida'
  return 'Nao realizada'
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
    const documentId = String(payload.documentId ?? '')
    const eventType = payload.eventType
    const justification = String(payload.justification ?? '').trim()

    if (!organizationId || !clientId || !certificateId || !documentId || !eventType) {
      return res.status(400).json({ ok: false, error: 'Informe empresa, cliente, certificado, nota e evento.' })
    }

    if (!eventDescriptions[eventType]) {
      return res.status(400).json({ ok: false, error: 'Tipo de manifestacao invalido.' })
    }

    if (eventType === '210240' && justification.length < 15) {
      return res.status(400).json({
        ok: false,
        error: 'Para Operacao nao Realizada, informe uma justificativa com pelo menos 15 caracteres.',
      })
    }

    await ensureOrganizationAccess(supabase, userId, organizationId)

    const [{ data: certificate }, { data: client }, { data: document }] = await Promise.all([
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
      supabase
        .from('nfe_documents')
        .select('*')
        .eq('id', documentId)
        .eq('client_id', clientId)
        .eq('organization_id', organizationId)
        .single(),
    ])

    if (!certificate || !client || !document) {
      return res.status(404).json({ ok: false, error: 'Cliente, certificado ou NF-e nao encontrado.' })
    }

    if (!certificate.certificate_file_data || !certificate.certificate_password) {
      return res.status(400).json({
        ok: false,
        error: 'O certificado precisa ter arquivo PFX/P12 e senha cadastrados para manifestar NF-e.',
      })
    }

    const accessKey = String(document.access_key ?? '')
    const cnpj = onlyDigits(client.cnpj || certificate.tax_id)

    if (accessKey.length !== 44) {
      return res.status(400).json({ ok: false, error: 'A NF-e precisa ter chave de acesso com 44 digitos.' })
    }

    if (cnpj.length !== 14) {
      return res.status(400).json({ ok: false, error: 'O cliente precisa ter CNPJ valido para manifestar NF-e.' })
    }

    const signedEventXml = signEventXml(
      buildEventXml({
        accessKey,
        cnpj,
        environment: String(certificate.environment ?? 'homologacao'),
        eventType,
        justification,
      }),
      String(certificate.certificate_file_data),
      String(certificate.certificate_password),
    )

    const responseXml = await postSoapWithCertificate({
      body: buildSoapEnvelope(signedEventXml),
      certificateFileData: String(certificate.certificate_file_data),
      certificatePassword: String(certificate.certificate_password),
      environment: String(certificate.environment ?? 'homologacao'),
    })
    const statusCodes = xmlValues(responseXml, 'cStat')
    const statusMessages = xmlValues(responseXml, 'xMotivo')
    const statusCode = statusCodes.at(-1) || statusCodes[0] || ''
    const statusMessage = statusMessages.at(-1) || statusMessages[0] || 'Manifestacao processada pela SEFAZ.'

    if (!['128', '135', '136', '573'].includes(statusCode)) {
      return res.status(400).json({
        ok: false,
        error: `SEFAZ retornou ${statusCode || 'sem codigo'}: ${statusMessage}`,
        statusCode,
      })
    }

    await supabase
      .from('nfe_documents')
      .update({
        last_consulted_at: new Date().toISOString(),
        manifestation_status: manifestationStatus(eventType),
        protocol_number: xmlValue(responseXml, 'nProt') || document.protocol_number || '',
        raw_summary: {
          ...(document.raw_summary ?? {}),
          lastManifestation: {
            eventType,
            response: responseXml,
            statusCode,
            statusMessage,
            sentAt: new Date().toISOString(),
          },
        },
        sefaz_status_code: statusCode,
      })
      .eq('id', documentId)

    return res.status(200).json({
      ok: true,
      message: `Manifestacao enviada: ${statusMessage}`,
      statusCode,
    })
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Nao foi possivel manifestar a NF-e.',
    })
  }
}
