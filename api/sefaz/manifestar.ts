/// <reference types="node" />

import process from 'node:process'
import type { VercelRequest, VercelResponse } from '../_utils/nfeBackendProxy'

function getHeader(req: VercelRequest, name: string) {
  const value = Object.entries(req.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function parseBody(body: unknown) {
  if (typeof body === 'string') return JSON.parse(body) as Record<string, unknown>
  return (body ?? {}) as Record<string, unknown>
}

function backendBaseUrl() {
  const value = String(process.env.SEFAZ_BACKEND_URL ?? '').trim().replace(/\/$/, '')
  if (!value || /example\.com|sua-api|seu-backend|api-fiscal/i.test(value)) {
    throw new Error('Configure SEFAZ_BACKEND_URL na Vercel com a URL real do backend fiscal.')
  }

  return value
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const authorization = getHeader(req, 'authorization')
    if (!authorization) {
      return res.status(401).json({ ok: false, error: 'Login obrigatorio para manifestar NF-e.' })
    }

    const body = parseBody(req.body)
    const documentId = String(body.documentId ?? '')
    if (!documentId) {
      return res.status(400).json({ ok: false, error: 'Informe a NF-e para manifestar.' })
    }

    const response = await fetch(`${backendBaseUrl()}/api/dfe/documents/${documentId}/manifest`, {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...body, userConfirmed: true }),
    })
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>

    return res.status(response.status).json(result)
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Nao foi possivel chamar o backend fiscal.',
    })
  }
}
