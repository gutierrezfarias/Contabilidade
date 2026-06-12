import { supabase } from './supabase'
import type {
  NfeDocumentActionRequest,
  NfeEmissionRequest,
  NfeEmissionResult,
} from '../types/nfeEmission'

async function getAccessToken() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  if (!token) {
    throw new Error('Entre novamente para emitir NF-e.')
  }

  return token
}

async function postNfe<TBody>(path: string, body: TBody) {
  const token = await getAccessToken()
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const result = (await response.json().catch(() => ({}))) as NfeEmissionResult & {
    error?: string
    ok?: boolean
  }

  if (!response.ok || result.ok === false || result.success === false) {
    const details = result.errors?.length ? ` ${result.errors.join(' ')}` : ''
    throw new Error(`${result.error ?? result.message ?? 'Nao foi possivel executar a operacao NF-e.'}${details}`)
  }

  return result
}

export function saveNfeDraft(input: NfeEmissionRequest) {
  return postNfe('/api/nfe/drafts', input)
}

export function validateNfe(input: NfeEmissionRequest) {
  return postNfe('/api/nfe/validate', input)
}

export function generateNfeXml(input: NfeEmissionRequest) {
  return postNfe('/api/nfe/generate-xml', input)
}

export function signNfeXml(input: NfeDocumentActionRequest) {
  return postNfe('/api/nfe/sign', input)
}

export function authorizeNfe(input: NfeDocumentActionRequest) {
  return postNfe('/api/nfe/authorize', input)
}
