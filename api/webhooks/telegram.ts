/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'
import process from 'node:process'

type VercelRequest = {
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
  query: Record<string, string | string[] | undefined>
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
}

type TelegramUser = {
  id?: number
  first_name?: string
  last_name?: string
  username?: string
}

type TelegramChat = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  title?: string
  type?: string
}

type TelegramMessage = {
  message_id?: number
  text?: string
  caption?: string
  chat: TelegramChat
  from?: TelegramUser
}

type TelegramUpdate = {
  update_id?: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  callback_query?: {
    id?: string
    data?: string
    message?: TelegramMessage
    from?: TelegramUser
  }
}

type ChannelRow = {
  id: string
  organization_id: string
  provider: string
  status: string
  config: Record<string, unknown> | null
}

type MessageTemplateRow = {
  trigger_phrase: string
  response_text: string
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY

function getHeader(req: VercelRequest, name: string) {
  const value = Object.entries(req.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function getQueryValue(req: VercelRequest, name: string) {
  const value = req.query[name]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function getConfigValue(config: ChannelRow['config'], key: string) {
  const value = config?.[key]
  return value === null || value === undefined ? '' : String(value)
}

function parseBody(body: unknown): TelegramUpdate {
  if (typeof body === 'string') {
    return JSON.parse(body) as TelegramUpdate
  }

  return (body ?? {}) as TelegramUpdate
}

function getIncomingMessage(update: TelegramUpdate) {
  return update.message ?? update.edited_message ?? update.callback_query?.message ?? null
}

function getIncomingText(update: TelegramUpdate, message: TelegramMessage) {
  return update.callback_query?.data ?? message.text ?? message.caption ?? ''
}

function getContactName(message: TelegramMessage) {
  const user = message.from
  const chat = message.chat
  const name = [user?.first_name ?? chat.first_name, user?.last_name ?? chat.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  return name || chat.title || chat.username || `Telegram ${chat.id}`
}

function getContactHandle(message: TelegramMessage) {
  return message.from?.username ? `@${message.from.username}` : String(message.chat.id)
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })

  return response.ok
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, endpoint: 'telegram-webhook' })
  }

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

  const secretHeader = getHeader(req, 'x-telegram-bot-api-secret-token')
  const channelId = getQueryValue(req, 'channel_id')

  const { data: channels, error: channelError } = await supabase
    .from('omnichannel_channels')
    .select('id, organization_id, provider, status, config')
    .eq('provider', 'telegram')
    .eq('status', 'Ativo')

  if (channelError) {
    return res.status(500).json({ ok: false, error: 'Nao foi possivel carregar canais Telegram.' })
  }

  const channel = ((channels ?? []) as ChannelRow[]).find((item) => {
    const savedSecret = getConfigValue(item.config, 'webhookSecret')
    const matchesSecret = Boolean(savedSecret && secretHeader && savedSecret === secretHeader)
    const matchesChannel = Boolean(channelId && item.id === channelId)

    return matchesSecret || (!savedSecret && matchesChannel)
  })

  if (!channel) {
    return res.status(401).json({ ok: false, error: 'Canal Telegram nao autorizado.' })
  }

  let update: TelegramUpdate
  try {
    update = parseBody(req.body)
  } catch {
    return res.status(400).json({ ok: false, error: 'Payload invalido.' })
  }

  const message = getIncomingMessage(update)
  if (!message?.chat?.id) {
    return res.status(200).json({ ok: true, ignored: true })
  }

  const incomingText = getIncomingText(update, message).trim()
  const contactName = getContactName(message)
  const contactHandle = getContactHandle(message)
  const now = new Date().toISOString()
  const externalConversationId = String(message.chat.id)

  const { data: existingConversations } = await supabase
    .from('omnichannel_conversations')
    .select('id')
    .eq('organization_id', channel.organization_id)
    .eq('provider', 'telegram')
    .eq('external_conversation_id', externalConversationId)
    .order('created_at', { ascending: false })
    .limit(1)

  let conversationId = String(existingConversations?.[0]?.id ?? '')

  if (conversationId) {
    await supabase
      .from('omnichannel_conversations')
      .update({
        channel_id: channel.id,
        contact_name: contactName,
        contact_handle: contactHandle,
        last_message_preview: incomingText.slice(0, 160),
        last_message_at: now,
      })
      .eq('id', conversationId)
  } else {
    const { data: conversation, error: conversationError } = await supabase
      .from('omnichannel_conversations')
      .insert({
        organization_id: channel.organization_id,
        channel_id: channel.id,
        provider: 'telegram',
        external_conversation_id: externalConversationId,
        contact_name: contactName,
        contact_handle: contactHandle,
        status: 'Aberta',
        last_message_preview: incomingText.slice(0, 160),
        last_message_at: now,
      })
      .select('id')
      .single()

    if (conversationError || !conversation?.id) {
      return res.status(500).json({ ok: false, error: 'Nao foi possivel criar conversa.' })
    }

    conversationId = String(conversation.id)
  }

  const { error: messageError } = await supabase.from('omnichannel_messages').insert({
    organization_id: channel.organization_id,
    conversation_id: conversationId,
    direction: 'entrada',
    sender_name: contactName,
    body: incomingText || '[mensagem sem texto]',
    metadata: {
      provider: 'telegram',
      update_id: update.update_id,
      message_id: message.message_id,
      chat: message.chat,
      from: message.from,
      callback_query_id: update.callback_query?.id,
    },
  })

  if (messageError) {
    return res.status(500).json({ ok: false, error: 'Nao foi possivel gravar mensagem.' })
  }

  const { data: templates } = await supabase
    .from('omnichannel_message_templates')
    .select('trigger_phrase, response_text')
    .eq('organization_id', channel.organization_id)
    .eq('active', true)
    .order('sort_order')

  const normalizedText = incomingText.toLowerCase()
  const matchedTemplate = ((templates ?? []) as MessageTemplateRow[]).find((template) => {
    const trigger = template.trigger_phrase.trim().toLowerCase()
    return trigger && normalizedText.includes(trigger)
  })

  const responseText =
    matchedTemplate?.response_text ??
    (normalizedText === '/start'
      ? 'Ola! Recebemos sua mensagem. Como posso te ajudar?'
      : '')

  const botToken = getConfigValue(channel.config, 'botToken')
  if (responseText && botToken) {
    const sent = await sendTelegramMessage(botToken, message.chat.id, responseText)

    if (sent) {
      await supabase.from('omnichannel_messages').insert({
        organization_id: channel.organization_id,
        conversation_id: conversationId,
        direction: 'saida',
        sender_name: 'Bot Telegram',
        body: responseText,
        metadata: { provider: 'telegram', automated: true },
      })
    }
  }

  return res.status(200).json({ ok: true, conversationId })
}
