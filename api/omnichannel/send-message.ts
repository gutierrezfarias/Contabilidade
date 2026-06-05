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

type ConversationRow = {
  id: string
  organization_id: string
  channel_id: string | null
  provider: string
  external_conversation_id: string
}

type ChannelRow = {
  id: string
  organization_id: string
  provider: string
  config: Record<string, unknown> | null
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY

function getHeader(req: VercelRequest, name: string) {
  const value = Object.entries(req.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function parseBody(body: unknown) {
  if (typeof body === 'string') {
    return JSON.parse(body) as { body?: string; conversationId?: string }
  }

  return (body ?? {}) as { body?: string; conversationId?: string }
}

function getConfigValue(config: ChannelRow['config'], key: string) {
  const value = config?.[key]
  return value === null || value === undefined ? '' : String(value)
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || 'Telegram recusou o envio da mensagem.')
  }
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
    return res.status(401).json({ ok: false, error: 'Login obrigatorio para enviar mensagem.' })
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  const user = userData.user

  if (userError || !user) {
    return res.status(401).json({ ok: false, error: 'Sessao invalida. Entre novamente.' })
  }

  let payload: { body?: string; conversationId?: string }
  try {
    payload = parseBody(req.body)
  } catch {
    return res.status(400).json({ ok: false, error: 'Payload invalido.' })
  }

  const messageBody = payload.body?.trim() ?? ''
  const conversationId = payload.conversationId?.trim() ?? ''

  if (!conversationId || !messageBody) {
    return res.status(400).json({ ok: false, error: 'Informe conversa e mensagem.' })
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('omnichannel_conversations')
    .select('id, organization_id, channel_id, provider, external_conversation_id')
    .eq('id', conversationId)
    .single()

  if (conversationError || !conversation) {
    return res.status(404).json({ ok: false, error: 'Conversa nao encontrada.' })
  }

  const conversationRow = conversation as ConversationRow
  const [{ data: role }, { data: member }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('organization_members')
      .select('organization_id')
      .eq('organization_id', conversationRow.organization_id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (role?.role !== 'admin' && !member) {
    return res.status(403).json({ ok: false, error: 'Voce nao tem acesso a esta conversa.' })
  }

  const channelRequest = conversationRow.channel_id
    ? supabase
        .from('omnichannel_channels')
        .select('id, organization_id, provider, config')
        .eq('id', conversationRow.channel_id)
        .single()
    : supabase
        .from('omnichannel_channels')
        .select('id, organization_id, provider, config')
        .eq('organization_id', conversationRow.organization_id)
        .eq('provider', conversationRow.provider)
        .single()

  const { data: channel, error: channelError } = await channelRequest

  if (channelError || !channel) {
    return res.status(404).json({ ok: false, error: 'Canal de origem nao encontrado.' })
  }

  const channelRow = channel as ChannelRow

  if (conversationRow.provider === 'telegram') {
    const botToken = getConfigValue(channelRow.config, 'botToken')

    if (!botToken) {
      return res.status(400).json({ ok: false, error: 'Token do Telegram nao configurado neste canal.' })
    }

    await sendTelegramMessage(botToken, conversationRow.external_conversation_id, messageBody)
  } else {
    return res.status(400).json({ ok: false, error: 'Envio implementado por enquanto apenas para Telegram.' })
  }

  const now = new Date().toISOString()
  const senderName = String(user.user_metadata?.name ?? user.email ?? 'Atendente')

  await supabase.from('omnichannel_messages').insert({
    organization_id: conversationRow.organization_id,
    conversation_id: conversationRow.id,
    direction: 'saida',
    sender_name: senderName,
    body: messageBody,
    metadata: { provider: conversationRow.provider, sent_by_user_id: user.id },
  })

  await supabase
    .from('omnichannel_conversations')
    .update({
      last_message_preview: messageBody.slice(0, 160),
      last_message_at: now,
      status: 'Aguardando cliente',
    })
    .eq('id', conversationRow.id)

  return res.status(200).json({ ok: true })
}
