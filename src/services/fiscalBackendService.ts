import { supabase } from './supabase'
import type {
  NcmCatalogItem,
  NcmSyncResult,
  NcmSyncStatus,
  NfeTaxPreviewRequest,
  NfeTaxPreviewResult,
} from '../types/fiscal'

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  if (!token) {
    throw new Error('Entre novamente para acessar os dados fiscais.')
  }

  return token
}

async function requestFiscal<T>(path: string, options: RequestInit = {}) {
  const token = await getAccessToken()
  const response = await fetch(path, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...options.headers,
    },
  })
  const result = (await response.json().catch(() => ({}))) as T & {
    error?: string
    ok?: boolean
    success?: boolean
  }

  if (!response.ok || result.ok === false || result.success === false) {
    throw new Error(result.error ?? 'Nao foi possivel executar a operacao fiscal.')
  }

  return result
}

export async function searchNcmCatalog(query: string, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit), query })
  const result = await requestFiscal<{ items: NcmCatalogItem[] }>(
    `/api/reference-data/ncm/search?${params.toString()}`,
  )
  return result.items
}

export async function getNcmCatalogItem(code: string) {
  const result = await requestFiscal<{ item: NcmCatalogItem }>(
    `/api/reference-data/ncm/${code.replace(/\D/g, '')}`,
  )
  return result.item
}

export async function getNcmSyncStatus() {
  const result = await requestFiscal<{ status: NcmSyncStatus | null }>(
    '/api/reference-data/ncm/sync-status',
  )
  return result.status
}

export function syncNcmCatalog() {
  return requestFiscal<NcmSyncResult>('/api/reference-data/ncm/sync', {
    method: 'POST',
  })
}

export function previewNfeTaxes(input: NfeTaxPreviewRequest) {
  return requestFiscal<NfeTaxPreviewResult>('/api/nfe/tax-preview', {
    body: JSON.stringify(input),
    method: 'POST',
  })
}
