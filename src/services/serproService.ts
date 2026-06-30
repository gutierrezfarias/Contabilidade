import { supabase } from './supabase'
import type {
  SerproContractPlan,
  SerproPairingKeyResult,
  SerproSettings,
  SerproSettingsResponse,
} from '../types/serpro'

type ApiResult = {
  error?: string
  ok?: boolean
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    throw new Error('Entre novamente para acessar as configuracoes Serpro.')
  }
  return token
}

async function requestSerpro<T>(path: string, options: RequestInit = {}) {
  const token = await getAccessToken()
  const response = await fetch(`/api/dfe/${path.replace(/^\/+/, '')}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...options.headers,
    },
  })
  const result = (await response.json().catch(() => ({}))) as T & ApiResult

  if (!response.ok || result.ok === false) {
    const message = result.error ?? 'Nao foi possivel executar a operacao Serpro.'
    throw new Error(
      message.includes('schema cache') || message.includes('does not exist') || message.includes('relation')
        ? 'Execute as migrations Serpro no Supabase, incluindo 20260629_revenue_federal_plan_experience.sql.'
        : message,
    )
  }

  return result
}

export function loadSerproSettings(organizationId: string) {
  const search = new URLSearchParams({ organizationId })
  return requestSerpro<SerproSettingsResponse>(`serpro/settings?${search.toString()}`)
}

export function saveSerproSettings(input: SerproSettings) {
  return requestSerpro<{ ok: boolean; settings: SerproSettings }>('serpro/settings', {
    body: JSON.stringify(input),
    method: 'PUT',
  })
}

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

export async function previewManualRevenueImport(organizationId: string, files: File[]) {
  const payloadFiles = await Promise.all(
    files.map(async (file) => ({
      base64Data: await fileToBase64(file),
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
    })),
  )

  return requestSerpro<{
    items: Array<Record<string, unknown>>
    message: string
    ok: boolean
  }>('revenue/manual-import/preview', {
    body: JSON.stringify({ files: payloadFiles, organizationId }),
    method: 'POST',
  })
}

export async function confirmManualRevenueImport(
  organizationId: string,
  files: File[],
  items: Array<Record<string, unknown>>,
) {
  const filesByName = new Map(files.map((file) => [file.name, file]))
  const payloadItems = await Promise.all(
    items.map(async (item) => {
      const itemFileName = String(item.fileName ?? '')
      const sourceFileName = itemFileName.includes('::') ? itemFileName.split('::')[0] : itemFileName
      const file = filesByName.get(sourceFileName)
      return {
        ...item,
        base64Data: file ? await fileToBase64(file) : '',
        fileName: itemFileName,
        mimeType: String(item.mimeType ?? file?.type ?? 'application/octet-stream'),
      }
    }),
  )

  return requestSerpro<{
    batchId: string
    duplicateCount: number
    errorCount: number
    ignoredCount: number
    importedCount: number
    message: string
    ok: boolean
  }>('revenue/manual-import/confirm', {
    body: JSON.stringify({ items: payloadItems, organizationId }),
    method: 'POST',
  })
}

export function saveSerproDirectCredential(input: {
  certificateId?: string
  consumerKey: string
  consumerSecret: string
  consumerSecretReference: string
  contractCnpj: string
  environment: string
  organizationId: string
  status: string
}) {
  return requestSerpro('serpro/direct-credentials', {
    body: JSON.stringify(input),
    method: 'POST',
  })
}

export function saveSerproOrganizationService(input: {
  billingModeOverride?: string
  customSalePrice?: number
  enabled: boolean
  exempt: boolean
  monthlyLimit: number
  organizationId: string
  serviceId: string
}) {
  return requestSerpro(`serpro/services/${encodeURIComponent(input.serviceId)}`, {
    body: JSON.stringify(input),
    method: 'PUT',
  })
}

export function testSerproSettings(settings: SerproSettings) {
  return requestSerpro<{
    billingMode: string
    message: string
    ok: boolean
    status: string
  }>('serpro/test', {
    body: JSON.stringify(settings),
    method: 'POST',
  })
}

export function loadAdminSerproStatus() {
  return requestSerpro('admin/serpro/status')
}

export function loadAdminSerproContract() {
  return requestSerpro('admin/serpro/contract')
}

export function saveAdminSerproContract(input: Record<string, unknown>) {
  return requestSerpro('admin/serpro/contract', {
    body: JSON.stringify(input),
    method: 'PUT',
  })
}

export function loadAdminSerproCatalog() {
  return requestSerpro('admin/serpro/catalog')
}

export function loadAdminSerproPricing() {
  return requestSerpro('admin/serpro/pricing')
}

export function loadAdminSerproOrganizations() {
  return requestSerpro('admin/serpro/organizations')
}

export function loadAdminSerproPlans() {
  return requestSerpro<{ ok: boolean; plans: SerproContractPlan[] }>('admin/serpro/plans')
}

export function saveAdminSerproPlan(plan: SerproContractPlan) {
  return requestSerpro<{ ok: boolean; plan: SerproContractPlan }>(
    `admin/serpro/plans/${encodeURIComponent(plan.code)}`,
    {
      body: JSON.stringify(plan),
      method: 'PUT',
    },
  )
}

export function renewSerproLocalAgentPairingKey(organizationId: string) {
  return requestSerpro<SerproPairingKeyResult>('serpro/local-agent/pairing-key', {
    body: JSON.stringify({ organizationId }),
    method: 'POST',
  })
}

export function createRevenueRequest(input: {
  authorizationId?: string
  certificateId?: string
  clientId?: string
  cnpj?: string
  organizationId: string
  payload: Record<string, unknown>
  serviceId: string
}) {
  return requestSerpro('revenue/requests', {
    body: JSON.stringify(input),
    method: 'POST',
  })
}
