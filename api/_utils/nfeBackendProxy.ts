/// <reference types="node" />

import process from 'node:process'

export type VercelRequest = {
  body?: unknown
  headers: Record<string, string | string[] | undefined>
  method?: string
  query?: Record<string, string | string[] | undefined>
}

export type VercelResponse = {
  json: (body: unknown) => void
  status: (code: number) => VercelResponse
}

function getHeader(req: VercelRequest, name: string) {
  const value = Object.entries(req.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function parseBody(body: unknown) {
  if (typeof body === 'string') {
    return JSON.parse(body) as Record<string, unknown>
  }

  return (body ?? {}) as Record<string, unknown>
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

export async function proxyNfePost(req: VercelRequest, res: VercelResponse, path: string) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const authorization = getHeader(req, 'authorization')
    if (!authorization) {
      return res.status(401).json({ ok: false, error: 'Login obrigatorio para operar NF-e.' })
    }
    const syncRunId = getHeader(req, 'x-sync-run-id')

    const response = await fetch(`${backendBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
        ...(syncRunId ? { 'x-sync-run-id': syncRunId } : {}),
      },
      body: JSON.stringify(parseBody(req.body)),
    })
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>

    return res.status(response.status).json(result)
  } catch (error) {
    return res.status(statusForProxyError(error)).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Nao foi possivel chamar o backend fiscal.',
    })
  }
}

export async function proxyFiscalBackend(
  req: VercelRequest,
  res: VercelResponse,
  path: string,
  allowedMethods: string[] = ['GET', 'POST'],
) {
  const method = (req.method ?? 'GET').toUpperCase()
  if (!allowedMethods.includes(method)) {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const authorization = getHeader(req, 'authorization')
    if (!authorization) {
      return res.status(401).json({ ok: false, error: 'Login obrigatorio para operar dados fiscais.' })
    }
    const syncRunId = getHeader(req, 'x-sync-run-id')

    const response = await fetch(`${backendBaseUrl()}${path}`, {
      method,
      headers: {
        authorization,
        'content-type': 'application/json',
        ...(syncRunId ? { 'x-sync-run-id': syncRunId } : {}),
      },
      body: method === 'GET' ? undefined : JSON.stringify(parseBody(req.body)),
    })
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>

    return res.status(response.status).json(result)
  } catch (error) {
    return res.status(statusForProxyError(error)).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Nao foi possivel chamar o backend fiscal.',
    })
  }
}
