/// <reference types="node" />

import process from 'node:process'
import type { VercelRequest, VercelResponse } from '../_utils/nfeBackendProxy.js'

type RoutedRequest = VercelRequest & {
  query?: Record<string, string | string[] | undefined>
}

function getHeader(req: VercelRequest, name: string) {
  const value = Object.entries(req.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function parseBody(body: unknown) {
  if (typeof body === 'string') return JSON.parse(body) as Record<string, unknown>
  return (body ?? {}) as Record<string, unknown>
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function backendBaseUrl() {
  const value = String(process.env.SEFAZ_BACKEND_URL ?? '').trim().replace(/\/$/, '')
  if (!value || /example\.com|sua-api|seu-backend|api-fiscal/i.test(value)) {
    throw new Error('SEFAZ_BACKEND_URL nao configurada.')
  }

  return value
}

function statusForProxyError(error: unknown) {
  return error instanceof Error && error.message.includes('SEFAZ_BACKEND_URL') ? 500 : 400
}

function pathFromQuery(query: RoutedRequest['query']) {
  const raw = query?.path
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : []
  return parts.map((part) => encodeURIComponent(part)).join('/')
}

function searchFromQuery(query: RoutedRequest['query']) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {}) as Array<[string, string | string[] | undefined]>) {
    if (key === 'path') continue
    const item = first(value)
    if (item) search.set(key, item)
  }
  return search.toString()
}

export default async function handler(req: RoutedRequest, res: VercelResponse) {
  const method = (req.method ?? 'GET').toUpperCase()

  try {
    const authorization = getHeader(req, 'authorization')
    if (!authorization) {
      return res.status(401).json({ ok: false, error: 'Login obrigatorio para operar DF-e.' })
    }

    const path = pathFromQuery(req.query)
    const search = searchFromQuery(req.query)
    const response = await fetch(`${backendBaseUrl()}/api/dfe/${path}${search ? `?${search}` : ''}`, {
      method,
      headers: {
        authorization,
        'content-type': 'application/json',
      },
      body: method === 'GET' ? undefined : JSON.stringify(parseBody(req.body)),
    })

    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('xml')) {
      const xml = await response.text()
      return res.status(response.status).json({ ok: response.ok, xml })
    }

    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>
    return res.status(response.status).json(result)
  } catch (error) {
    return res.status(statusForProxyError(error)).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Nao foi possivel chamar o backend DF-e.',
    })
  }
}
