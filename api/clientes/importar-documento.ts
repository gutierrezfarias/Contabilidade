/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'
import process from 'node:process'

type VercelRequest = {
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
}

type ImportPayload = {
  cnpjs?: string[]
  fileName?: string
  mimeType?: string
  text?: string
}

type ImportedClient = {
  bairro: string
  cep: string
  cidade: string
  cnaePrincipal: string
  cnpj: string
  complemento: string
  email: string
  endereco: string
  estado: string
  naturezaJuridica: string
  nomeFantasia: string
  numero: string
  porte: string
  razaoSocial: string
  regimeTributario: string
  situacaoCadastral: string
  telefone: string
}

type BrasilApiCompany = {
  bairro?: string
  cep?: string
  cnae_fiscal?: number
  cnae_fiscal_descricao?: string
  cnpj?: string
  complemento?: string
  ddd_telefone_1?: string
  ddd_telefone_2?: string
  descricao_porte?: string
  descricao_situacao_cadastral?: string
  email?: string
  logradouro?: string
  municipio?: string
  natureza_juridica?: string
  nome_fantasia?: string
  numero?: string
  opcao_pelo_mei?: boolean | null
  opcao_pelo_simples?: boolean | null
  porte?: string
  razao_social?: string
  uf?: string
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
const cnpjRegex = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g

function getHeader(req: VercelRequest, name: string) {
  const value = Object.entries(req.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function parseBody(body: unknown): ImportPayload {
  if (typeof body === 'string') {
    return JSON.parse(body) as ImportPayload
  }

  return (body ?? {}) as ImportPayload
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function validateCnpj(value: string) {
  const cnpj = onlyDigits(value)
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false

  const calculateDigit = (base: string, weights: number[]) => {
    const sum = base
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }

  const firstDigit = calculateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const secondDigit = calculateDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

  return firstDigit === Number(cnpj[12]) && secondDigit === Number(cnpj[13])
}

function formatCnpj(value: string) {
  const digits = onlyDigits(value)
  return digits.length === 14
    ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : value
}

function formatCep(value: string) {
  const digits = onlyDigits(value)
  return digits.length === 8 ? digits.replace(/^(\d{5})(\d{3})$/, '$1-$2') : value
}

function findFirst(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }

  return ''
}

function normalizeText(text: string) {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n')
}

function normalizeSearchText(text: string) {
  return normalizeText(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function findCnpjs(text: string) {
  return Array.from(
    new Set(
      (text.match(cnpjRegex) ?? [])
        .map(onlyDigits)
        .filter(validateCnpj),
    ),
  )
}

function fallbackFromText(text: string, cnpj: string): ImportedClient {
  const normalizedText = normalizeSearchText(text)

  const fallback = {
    bairro: findFirst(normalizedText, [/BAIRRO\/DISTRITO\s*\n?\s*([^\n]+)/i]),
    cep: formatCep(findFirst(normalizedText, [/CEP\s*\n?\s*([0-9.\- ]{8,12})/i])),
    cidade: findFirst(normalizedText, [/MUNIC[IÍ]PIO\s*\n?\s*([^\n]+)/i]),
    cnaePrincipal: findFirst(normalizedText, [/ATIVIDADE ECON[ÔO]MICA PRINCIPAL\s*\n?\s*([^\n]+)/i]),
    cnpj: formatCnpj(cnpj),
    complemento: findFirst(normalizedText, [/COMPLEMENTO\s*\n?\s*([^\n]+)/i]),
    email: findFirst(normalizedText, [/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i]),
    endereco: findFirst(normalizedText, [/LOGRADOURO\s*\n?\s*([^\n]+)/i]),
    estado: findFirst(normalizedText, [/UF\s*\n?\s*([A-Z]{2})/i]),
    naturezaJuridica: findFirst(normalizedText, [/NATUREZA JUR[IÍ]DICA\s*\n?\s*([^\n]+)/i]),
    nomeFantasia: findFirst(normalizedText, [/NOME FANTASIA\)\s*\n?\s*([^\n]+)/i]),
    numero: findFirst(normalizedText, [/N[ÚU]MERO\s*\n?\s*([^\n]+)/i]),
    porte: findFirst(normalizedText, [/PORTE\s*\n?\s*([^\n]+)/i]) || 'Nao informado',
    razaoSocial: findFirst(normalizedText, [/NOME EMPRESARIAL\s*\n?\s*([^\n]+)/i]),
    regimeTributario: 'Nao informado',
    situacaoCadastral: findFirst(normalizedText, [/SITUA[CÇ][AÃ]O CADASTRAL\s*\n?\s*([^\n]+)/i]),
    telefone: findFirst(normalizedText, [/TELEFONE\s*\n?\s*([0-9()\-.\s]+)/i]),
  }

  return {
    ...fallback,
    cidade: findFirst(normalizedText, [/MUNICIPIO\s*\n?\s*([^\n]+)/i]) || fallback.cidade,
    cnaePrincipal:
      findFirst(normalizedText, [/ATIVIDADE ECONOMICA PRINCIPAL\s*\n?\s*([^\n]+)/i]) ||
      fallback.cnaePrincipal,
    naturezaJuridica:
      findFirst(normalizedText, [/NATUREZA JURIDICA\s*\n?\s*([^\n]+)/i]) || fallback.naturezaJuridica,
    nomeFantasia:
      findFirst(normalizedText, [/TITULO DO ESTABELECIMENTO.*\n?\s*([^\n]+)/i]) || fallback.nomeFantasia,
    numero: findFirst(normalizedText, [/NUMERO\s*\n?\s*([^\n]+)/i]) || fallback.numero,
    situacaoCadastral:
      findFirst(normalizedText, [/SITUACAO CADASTRAL\s*\n?\s*([^\n]+)/i]) || fallback.situacaoCadastral,
  }
}

function normalizePorte(value?: string) {
  const text = String(value ?? '').toUpperCase()
  if (text.includes('MICRO') || text === 'ME') return 'ME'
  if (text.includes('PEQUENO') || text === 'EPP') return 'EPP'
  if (text.includes('DEMAIS')) return 'Demais'
  return value || 'Nao informado'
}

function resolveRegime(company: BrasilApiCompany) {
  if (company.opcao_pelo_mei) return 'MEI'
  if (company.opcao_pelo_simples) return 'Simples Nacional'
  return 'Nao informado'
}

function fromBrasilApi(company: BrasilApiCompany, fallback: ImportedClient): ImportedClient {
  return {
    bairro: company.bairro || fallback.bairro,
    cep: formatCep(company.cep || fallback.cep),
    cidade: company.municipio || fallback.cidade,
    cnaePrincipal: company.cnae_fiscal
      ? `${company.cnae_fiscal} - ${company.cnae_fiscal_descricao ?? ''}`.trim()
      : fallback.cnaePrincipal,
    cnpj: formatCnpj(company.cnpj || fallback.cnpj),
    complemento: company.complemento || fallback.complemento,
    email: company.email || fallback.email,
    endereco: company.logradouro || fallback.endereco,
    estado: company.uf || fallback.estado,
    naturezaJuridica: company.natureza_juridica || fallback.naturezaJuridica,
    nomeFantasia: company.nome_fantasia || fallback.nomeFantasia,
    numero: company.numero || fallback.numero,
    porte: normalizePorte(company.descricao_porte || company.porte || fallback.porte),
    razaoSocial: company.razao_social || fallback.razaoSocial,
    regimeTributario: resolveRegime(company) || fallback.regimeTributario,
    situacaoCadastral: company.descricao_situacao_cadastral || fallback.situacaoCadastral,
    telefone: company.ddd_telefone_1 || company.ddd_telefone_2 || fallback.telefone,
  }
}

async function consultCnpj(cnpj: string, fallback: ImportedClient) {
  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
    if (!response.ok) return fallback
    return fromBrasilApi((await response.json()) as BrasilApiCompany, fallback)
  } catch {
    return fallback
  }
}

async function handleImport(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      endpoint: 'clientes-importar-documento',
      supabaseUrlConfigured: Boolean(supabaseUrl),
      serviceRoleConfigured: Boolean(supabaseServiceKey),
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({
      ok: false,
      error: 'Configure SUPABASE_SERVICE_ROLE_KEY e VITE_SUPABASE_URL na Vercel.',
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  })

  const authorization = getHeader(req, 'authorization')
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim()

  if (!accessToken) {
    return res.status(401).json({ ok: false, error: 'Login obrigatorio para importar documento.' })
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData.user) {
    return res.status(401).json({ ok: false, error: 'Sessao invalida. Entre novamente.' })
  }

  let payload: ImportPayload
  try {
    payload = parseBody(req.body)
  } catch {
    return res.status(400).json({ ok: false, error: 'Payload invalido.' })
  }

  const text = payload.text ?? ''
  const cnpjs = Array.from(
    new Set([...(payload.cnpjs ?? []).map(onlyDigits), ...findCnpjs(text)].filter(validateCnpj)),
  )

  if (!cnpjs.length) {
    return res.status(400).json({
      ok: false,
      error: 'Nao foi possivel localizar um CNPJ neste documento. Verifique se o arquivo esta legivel.',
    })
  }

  const options = await Promise.all(
    cnpjs.map(async (cnpj) => {
      const fallback = fallbackFromText(text, cnpj)
      return consultCnpj(cnpj, fallback)
    }),
  )

  return res.status(200).json({
    ok: true,
    cnpjs: cnpjs.map(formatCnpj),
    data: options[0],
    options,
    textPreview: text.slice(0, 800),
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await handleImport(req, res)
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Erro interno na API de importacao.',
    })
  }
}
