export type OmnichannelProvider = 'telegram' | 'whatsapp' | 'instagram' | 'facebook'
export type OmnichannelStatus = 'Nao configurado' | 'Configurando' | 'Ativo' | 'Falha'
export type OmnichannelConversationStatus = 'Aberta' | 'Aguardando cliente' | 'Resolvida' | 'Pendente'
export type OmnichannelMessageDirection = 'entrada' | 'saida' | 'agente'

export interface OmnichannelChannel {
  id: string
  organizationId: string
  provider: OmnichannelProvider
  displayName: string
  status: OmnichannelStatus
  webhookUrl: string
  secretReference: string
  config: Record<string, string>
  notes: string
  updatedAt: string
}

export interface AiAgent {
  id: string
  organizationId: string
  name: string
  roleTitle: string
  tone: string
  instructions: string
  canSendDocuments: boolean
  active: boolean
}

export interface MessageTemplate {
  id: string
  organizationId: string
  title: string
  triggerPhrase: string
  responseText: string
  sortOrder: number
  active: boolean
}

export interface OmnichannelConversation {
  id: string
  organizationId: string
  channelId: string | null
  provider: OmnichannelProvider
  externalConversationId: string
  contactName: string
  contactHandle: string
  status: OmnichannelConversationStatus
  assignedAgentId: string | null
  lastMessagePreview: string
  lastMessageAt: string
}

export interface OmnichannelMessage {
  id: string
  organizationId: string
  conversationId: string
  direction: OmnichannelMessageDirection
  senderName: string
  body: string
  attachmentName: string
  attachmentUrl: string
  createdAt: string
}
