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

type ActivatePayload = {
  botToken?: string
  webhookSecret?: string
  webhookUrl?: string
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY

function getHeader(req: VercelRequest, name: string) {
  const value = Object.entries(req.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function parseBody(body: unknown): ActivatePayload {
  if (typeof body === 'string') {
    return JSON.parse(body) as ActivatePayload
  }

  return (body ?? {}) as ActivatePayload
}

async function telegramRequest(botToken: string, method: string, body?: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string }

  if (!response.ok || !result.ok) {
    throw new Error(result.description ?? 'Telegram recusou a configuracao.')
  }

  return result
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    return res.status(401).json({ ok: false, error: 'Login obrigatorio para ativar o webhook.' })
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  const user = userData.user

  if (userError || !user) {
    return res.status(401).json({ ok: false, error: 'Sessao invalida. Entre novamente.' })
  }

  let payload: ActivatePayload
  try {
    payload = parseBody(req.body)
  } catch {
    return res.status(400).json({ ok: false, error: 'Payload invalido.' })
  }

  const botToken = payload.botToken?.trim() ?? ''
  const webhookUrl = payload.webhookUrl?.trim() ?? ''
  const webhookSecret = payload.webhookSecret?.trim() ?? ''

  if (!botToken || !webhookUrl || !webhookSecret) {
    return res.status(400).json({
      ok: false,
      error: 'Informe Token do bot, URL do webhook e Secret do webhook.',
    })
  }

  const [{ data: role }, { data: memberships }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
    supabase.from('organization_members').select('organization_id').eq('user_id', user.id),
  ])

  if (role?.role !== 'admin' && !memberships?.length) {
    return res.status(403).json({ ok: false, error: 'Usuario sem escritorio vinculado.' })
  }

  try {
    await telegramRequest(botToken, 'getMe')
    const result = await telegramRequest(botToken, 'setWebhook', {
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
      secret_token: webhookSecret,
      url: webhookUrl,
    })

    return res.status(200).json({ ok: true, result })
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Nao foi possivel ativar o webhook.',
    })
  }
}
