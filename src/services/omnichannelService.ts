import { supabase } from './supabase'
import type {
  AiAgent,
  MessageTemplate,
  OmnichannelChannel,
  OmnichannelConversation,
  OmnichannelMessage,
  OmnichannelProvider,
  OmnichannelStatus,
} from '../types/omnichannel'

type ChannelInput = Omit<OmnichannelChannel, 'id' | 'organizationId' | 'updatedAt'>
type AgentInput = Omit<AiAgent, 'id' | 'organizationId'>
type TemplateInput = Omit<MessageTemplate, 'id' | 'organizationId'>

function fail(error: { message: string } | null, fallback: string) {
  if (error) {
    throw new Error(
      error.message.includes('does not exist') ||
        error.message.includes('schema cache') ||
        error.message.includes('Could not find')
        ? 'Execute a migracao Supabase do Omnichannel antes de usar este modulo.'
        : fallback,
    )
  }
}

function safeConfig(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, String(item ?? '')]),
  )
}

function mapChannel(row: Record<string, unknown>): OmnichannelChannel {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    provider: String(row.provider) as OmnichannelProvider,
    displayName: String(row.display_name ?? ''),
    status: String(row.status ?? 'Nao configurado') as OmnichannelStatus,
    webhookUrl: String(row.webhook_url ?? ''),
    secretReference: String(row.secret_reference ?? ''),
    config: safeConfig(row.config),
    notes: String(row.notes ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

function mapAgent(row: Record<string, unknown>): AiAgent {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name ?? ''),
    roleTitle: String(row.role_title ?? ''),
    tone: String(row.tone ?? ''),
    instructions: String(row.instructions ?? ''),
    canSendDocuments: Boolean(row.can_send_documents),
    active: Boolean(row.active),
  }
}

function mapTemplate(row: Record<string, unknown>): MessageTemplate {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    title: String(row.title ?? ''),
    triggerPhrase: String(row.trigger_phrase ?? ''),
    responseText: String(row.response_text ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active),
  }
}

function mapConversation(row: Record<string, unknown>): OmnichannelConversation {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    channelId: row.channel_id ? String(row.channel_id) : null,
    provider: String(row.provider) as OmnichannelProvider,
    externalConversationId: String(row.external_conversation_id ?? ''),
    contactName: String(row.contact_name ?? ''),
    contactHandle: String(row.contact_handle ?? ''),
    status: String(row.status ?? 'Aberta') as OmnichannelConversation['status'],
    assignedAgentId: row.assigned_agent_id ? String(row.assigned_agent_id) : null,
    lastMessagePreview: String(row.last_message_preview ?? ''),
    lastMessageAt: String(row.last_message_at ?? ''),
  }
}

function mapMessage(row: Record<string, unknown>): OmnichannelMessage {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    conversationId: String(row.conversation_id),
    direction: String(row.direction ?? 'entrada') as OmnichannelMessage['direction'],
    senderName: String(row.sender_name ?? ''),
    body: String(row.body ?? ''),
    attachmentName: String(row.attachment_name ?? ''),
    attachmentUrl: String(row.attachment_url ?? ''),
    createdAt: String(row.created_at ?? ''),
  }
}

export async function listOmnichannelChannels(organizationId: string | null) {
  if (!organizationId) return []

  const { data, error } = await supabase
    .from('omnichannel_channels')
    .select('*')
    .eq('organization_id', organizationId)
    .order('provider')

  fail(error, 'Nao foi possivel carregar os canais.')
  return (data ?? []).map((channel) => mapChannel(channel))
}

export async function saveOmnichannelChannel(
  organizationId: string,
  input: ChannelInput,
  channelId?: string | null,
) {
  const payload = {
    organization_id: organizationId,
    provider: input.provider,
    display_name: input.displayName,
    status: input.status,
    webhook_url: input.webhookUrl,
    secret_reference: input.secretReference,
    config: input.config,
    notes: input.notes,
    updated_at: new Date().toISOString(),
  }

  const request = channelId
    ? supabase.from('omnichannel_channels').update(payload).eq('id', channelId)
    : supabase.from('omnichannel_channels').upsert(payload, { onConflict: 'organization_id,provider' })

  const { error } = await request
  fail(error, 'Nao foi possivel salvar a configuracao do canal.')
}

export async function deleteOmnichannelChannel(channelId: string) {
  const { error } = await supabase.from('omnichannel_channels').delete().eq('id', channelId)
  fail(error, 'Nao foi possivel excluir o canal.')
}

export async function listAiAgents(organizationId: string | null) {
  if (!organizationId) return []

  const { data, error } = await supabase
    .from('omnichannel_ai_agents')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name')

  fail(error, 'Nao foi possivel carregar os agentes.')
  return (data ?? []).map((agent) => mapAgent(agent))
}

export async function saveAiAgent(organizationId: string, input: AgentInput, agentId?: string | null) {
  const payload = {
    organization_id: organizationId,
    name: input.name,
    role_title: input.roleTitle,
    tone: input.tone,
    instructions: input.instructions,
    can_send_documents: input.canSendDocuments,
    active: input.active,
    updated_at: new Date().toISOString(),
  }

  const request = agentId
    ? supabase.from('omnichannel_ai_agents').update(payload).eq('id', agentId)
    : supabase.from('omnichannel_ai_agents').insert(payload)

  const { error } = await request
  fail(error, 'Nao foi possivel salvar o agente.')
}

export async function deleteAiAgent(agentId: string) {
  const { error } = await supabase.from('omnichannel_ai_agents').delete().eq('id', agentId)
  fail(error, 'Nao foi possivel excluir o agente.')
}

export async function listMessageTemplates(organizationId: string | null) {
  if (!organizationId) return []

  const { data, error } = await supabase
    .from('omnichannel_message_templates')
    .select('*')
    .eq('organization_id', organizationId)
    .order('sort_order')

  fail(error, 'Nao foi possivel carregar as mensagens padrao.')
  return (data ?? []).map((template) => mapTemplate(template))
}

export async function saveMessageTemplate(
  organizationId: string,
  input: TemplateInput,
  templateId?: string | null,
) {
  const payload = {
    organization_id: organizationId,
    title: input.title,
    trigger_phrase: input.triggerPhrase,
    response_text: input.responseText,
    sort_order: input.sortOrder,
    active: input.active,
    updated_at: new Date().toISOString(),
  }

  const request = templateId
    ? supabase.from('omnichannel_message_templates').update(payload).eq('id', templateId)
    : supabase.from('omnichannel_message_templates').insert(payload)

  const { error } = await request
  fail(error, 'Nao foi possivel salvar a mensagem padrao.')
}

export async function deleteMessageTemplate(templateId: string) {
  const { error } = await supabase.from('omnichannel_message_templates').delete().eq('id', templateId)
  fail(error, 'Nao foi possivel excluir a mensagem padrao.')
}

export async function listOmnichannelConversations(organizationId: string | null) {
  if (!organizationId) return []

  const { data, error } = await supabase
    .from('omnichannel_conversations')
    .select('*')
    .eq('organization_id', organizationId)
    .order('last_message_at', { ascending: false })

  fail(error, 'Nao foi possivel carregar os atendimentos.')
  return (data ?? []).map((conversation) => mapConversation(conversation))
}

export async function listOmnichannelMessages(conversationId: string | null) {
  if (!conversationId) return []

  const { data, error } = await supabase
    .from('omnichannel_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at')

  fail(error, 'Nao foi possivel carregar as mensagens.')
  return (data ?? []).map((message) => mapMessage(message))
}

export async function sendOmnichannelMessage(conversationId: string, body: string) {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token

  if (!accessToken) {
    throw new Error('Sessao expirada. Entre novamente no sistema.')
  }

  const response = await fetch('/api/omnichannel/send-message', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ body, conversationId }),
  })

  const result = (await response.json().catch(() => ({}))) as { error?: string }

  if (!response.ok) {
    throw new Error(result.error ?? 'Nao foi possivel enviar a mensagem.')
  }
}

export async function activateTelegramWebhook(input: {
  botToken: string
  webhookSecret: string
  webhookUrl: string
}) {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token

  if (!accessToken) {
    throw new Error('Sessao expirada. Entre novamente no sistema.')
  }

  const response = await fetch('/api/omnichannel/activate-telegram-webhook', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  const result = (await response.json().catch(() => ({}))) as { error?: string }

  if (!response.ok) {
    throw new Error(result.error ?? 'Nao foi possivel ativar o webhook do Telegram.')
  }
}
