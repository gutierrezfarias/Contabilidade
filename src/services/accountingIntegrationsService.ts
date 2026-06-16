import { supabase } from './supabase'
import type {
  AccountingImportConfirmResult,
  AccountingImportPreviewRequest,
  AccountingImportPreviewResult,
  AccountingIntegration,
  AccountingIntegrationClient,
  AccountingIntegrationClientInput,
  AccountingIntegrationInput,
  AccountingObligation,
  AccountingProviderConnectionResult,
  AccountingSyncRun,
  AccountingTaxRecord,
} from '../types/accountingIntegrations'

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  if (!token) {
    throw new Error('Entre novamente para acessar as integracoes contabeis.')
  }

  return token
}

async function requestAccounting<T>(path: string, options: RequestInit = {}) {
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
  }

  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? 'Nao foi possivel executar a operacao contabil.')
  }

  return result
}

function params(values: Record<string, string | undefined>) {
  const search = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })
  return search.toString()
}

export async function listAccountingIntegrations(organizationId: string) {
  const query = params({ organizationId })
  const result = await requestAccounting<{ integrations: AccountingIntegration[] }>(
    `/api/dfe/accounting-integrations?${query}`,
  )
  return result.integrations
}

export async function saveAccountingIntegration(input: AccountingIntegrationInput, id?: string) {
  if (id) {
    const query = params({ organizationId: input.organizationId })
    const result = await requestAccounting<{ integration: AccountingIntegration }>(
      `/api/dfe/accounting-integrations/${id}?${query}`,
      {
        body: JSON.stringify(input),
        method: 'PUT',
      },
    )
    return result.integration
  }

  const result = await requestAccounting<{ integration: AccountingIntegration }>('/api/dfe/accounting-integrations', {
    body: JSON.stringify(input),
    method: 'POST',
  })
  return result.integration
}

export function deleteAccountingIntegration(organizationId: string, id: string) {
  const query = params({ organizationId })
  return requestAccounting<{ ok: boolean }>(`/api/dfe/accounting-integrations/${id}?${query}`, {
    method: 'DELETE',
  })
}

export function testAccountingIntegration(organizationId: string, id: string) {
  const query = params({ organizationId })
  return requestAccounting<AccountingProviderConnectionResult>(`/api/dfe/accounting-integrations/${id}/test?${query}`, {
    method: 'POST',
  })
}

export function syncAccountingIntegration(organizationId: string, id: string) {
  return requestAccounting<{ ok: boolean; message: string; syncRunId: string; status: string }>(
    `/api/dfe/accounting-integrations/${id}/sync`,
    {
      body: JSON.stringify({ organizationId, integrationId: id, syncType: 'manual' }),
      method: 'POST',
    },
  )
}

export async function listIntegrationClients(organizationId: string, integrationId: string) {
  const query = params({ organizationId })
  const result = await requestAccounting<{ clients: AccountingIntegrationClient[] }>(
    `/api/dfe/accounting-integrations/${integrationId}/clients?${query}`,
  )
  return result.clients
}

export async function linkIntegrationClient(integrationId: string, input: AccountingIntegrationClientInput) {
  const result = await requestAccounting<{ client: AccountingIntegrationClient }>(
    `/api/dfe/accounting-integrations/${integrationId}/clients/link`,
    {
      body: JSON.stringify(input),
      method: 'POST',
    },
  )
  return result.client
}

export function unlinkIntegrationClient(organizationId: string, integrationId: string, linkId: string) {
  const query = params({ organizationId })
  return requestAccounting<{ ok: boolean }>(
    `/api/dfe/accounting-integrations/${integrationId}/clients/${linkId}?${query}`,
    { method: 'DELETE' },
  )
}

export async function listIntegrationSyncRuns(organizationId: string, integrationId: string) {
  const query = params({ organizationId })
  const result = await requestAccounting<{ syncRuns: AccountingSyncRun[] }>(
    `/api/dfe/accounting-integrations/${integrationId}/sync-runs?${query}`,
  )
  return result.syncRuns
}

export function previewAccountingImport(input: AccountingImportPreviewRequest) {
  return requestAccounting<AccountingImportPreviewResult>('/api/dfe/accounting-imports/preview', {
    body: JSON.stringify(input),
    method: 'POST',
  })
}

export function confirmAccountingImport(organizationId: string, batchId: string) {
  return requestAccounting<AccountingImportConfirmResult>('/api/dfe/accounting-imports/confirm', {
    body: JSON.stringify({ organizationId, batchId }),
    method: 'POST',
  })
}

export async function listAccountingTaxes(
  organizationId: string,
  filters: { clientId?: string; competence?: string; status?: string } = {},
) {
  const query = params({ organizationId, ...filters })
  const result = await requestAccounting<{ records: AccountingTaxRecord[] }>(`/api/dfe/accounting/taxes?${query}`)
  return result.records
}

export async function listAccountingObligations(
  organizationId: string,
  filters: { clientId?: string; competence?: string; status?: string } = {},
) {
  const query = params({ organizationId, ...filters })
  const result = await requestAccounting<{ records: AccountingObligation[] }>(
    `/api/dfe/accounting/obligations?${query}`,
  )
  return result.records
}
