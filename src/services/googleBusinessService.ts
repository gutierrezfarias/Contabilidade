import { supabase } from './supabase'
import type {
  GoogleBusinessLocation,
  GoogleBusinessStatus,
} from '../types/googleBusiness'

type ApiResult<T> = T & {
  ok?: boolean
  error?: string
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  if (!token) {
    throw new Error('Entre novamente para acessar a integracao Google.')
  }

  return token
}

async function googleBusinessRequest<T>(
  action: string,
  organizationId: string,
  options: { body?: Record<string, unknown>; method?: 'GET' | 'POST' } = {},
) {
  const method = options.method ?? 'POST'
  const token = await getAccessToken()
  const search = new URLSearchParams({ action, organizationId })
  const response = await fetch(`/api/google-business?${search.toString()}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    },
    body: method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined,
  })
  const result = (await response.json().catch(() => ({}))) as ApiResult<T>

  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? 'Nao foi possivel executar a acao Google.')
  }

  return result
}

export async function loadGoogleBusinessStatus(organizationId: string) {
  return googleBusinessRequest<GoogleBusinessStatus>('status', organizationId, { method: 'GET' })
}

export async function startGoogleBusinessOAuth(organizationId: string) {
  const result = await googleBusinessRequest<{ authUrl: string }>('start-oauth', organizationId)
  window.location.href = result.authUrl
}

export async function fetchGoogleBusinessLocations(organizationId: string) {
  return googleBusinessRequest<{ locations: GoogleBusinessLocation[] }>('locations', organizationId)
}

export async function selectGoogleBusinessLocation(organizationId: string, locationId: string) {
  return googleBusinessRequest<GoogleBusinessStatus>('select-location', organizationId, {
    body: { locationId },
  })
}

export async function checkGoogleBusinessData(organizationId: string) {
  return googleBusinessRequest<GoogleBusinessStatus>('check', organizationId)
}

export async function syncGoogleBusinessData(organizationId: string) {
  return googleBusinessRequest<GoogleBusinessStatus>('sync', organizationId)
}

export async function disconnectGoogleBusiness(organizationId: string) {
  return googleBusinessRequest<GoogleBusinessStatus>('disconnect', organizationId)
}
