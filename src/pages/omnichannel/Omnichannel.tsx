import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../hooks/useAuth'
import {
  deleteAiAgent,
  deleteMessageTemplate,
  deleteOmnichannelChannel,
  activateTelegramWebhook,
  listAiAgents,
  listMessageTemplates,
  listOmnichannelChannels,
  listOmnichannelConversations,
  listOmnichannelMessages,
  saveAiAgent,
  saveMessageTemplate,
  saveOmnichannelChannel,
  sendOmnichannelMessage,
} from '../../services/omnichannelService'
import { resolveOrganizationId } from '../../services/platformService'
import type {
  AiAgent,
  MessageTemplate,
  OmnichannelChannel,
  OmnichannelMessage,
  OmnichannelProvider,
  OmnichannelStatus,
} from '../../types/omnichannel'

type OmnichannelSection = 'atendimento' | 'configuracoes' | 'agentes' | 'mensagens'

type ChannelForm = Omit<OmnichannelChannel, 'id' | 'organizationId' | 'updatedAt'>
type AgentForm = Omit<AiAgent, 'id' | 'organizationId'>
type TemplateForm = Omit<MessageTemplate, 'id' | 'organizationId'>

const statuses: OmnichannelStatus[] = ['Nao configurado', 'Configurando', 'Ativo', 'Falha']

const providerDefinitions: Record<
  OmnichannelProvider,
  {
    label: string
    cost: string
    description: string
    docsUrl: string
    fields: Array<{ key: string; label: string; placeholder: string; type?: 'text' | 'password' }>
    steps: string[]
  }
> = {
  telegram: {
    label: 'Telegram',
    cost: 'API gratuita; custo fica no seu backend/hospedagem.',
    description: 'Ideal para comecar porque usa bot token e webhook HTTPS.',
    docsUrl: 'https://core.telegram.org/bots/api',
    fields: [
      { key: 'botUsername', label: 'Usuario do bot', placeholder: '@seu_bot' },
      { key: 'botToken', label: 'Token do bot', placeholder: '123456:ABC-DEF...', type: 'password' },
      { key: 'webhookSecret', label: 'Secret do webhook', placeholder: 'token interno para validar chamadas' },
    ],
    steps: [
      'Criar o bot no BotFather e gerar o token.',
      'Cadastrar o token nesta tela para o contador nao precisar abrir o Supabase.',
      'Criar endpoint HTTPS para receber updates.',
      'Configurar setWebhook apontando para esse endpoint.',
    ],
  },
  whatsapp: {
    label: 'WhatsApp',
    cost: 'Meta pode cobrar por conversas/mensagens e exige conta Business.',
    description: 'Usa WhatsApp Cloud API, WABA, Phone Number ID, templates e webhooks.',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    fields: [
      { key: 'businessAccountId', label: 'Business Account ID', placeholder: 'ID do Meta Business' },
      { key: 'whatsappBusinessAccountId', label: 'WABA ID', placeholder: 'ID da conta WhatsApp Business' },
      { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: 'ID do numero na Cloud API' },
      { key: 'accessToken', label: 'Access token', placeholder: 'Token permanente ou temporario da Meta', type: 'password' },
      { key: 'webhookVerifyToken', label: 'Verify token do webhook', placeholder: 'token de verificacao' },
    ],
    steps: [
      'Criar app no Meta for Developers.',
      'Conectar/validar Business Manager e numero WhatsApp.',
      'Configurar webhooks e templates aprovados.',
      'Cadastrar os IDs e token nesta tela para o canal ficar vinculado ao escritorio.',
    ],
  },
  instagram: {
    label: 'Instagram',
    cost: 'Sem custo direto de API, mas exige permissao Meta e conta profissional.',
    description: 'Usa Instagram Messaging API com pagina Facebook vinculada.',
    docsUrl: 'https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api',
    fields: [
      { key: 'instagramAccountId', label: 'Instagram Account ID', placeholder: 'ID da conta profissional' },
      { key: 'pageId', label: 'Facebook Page ID vinculada', placeholder: 'ID da pagina' },
      { key: 'pageAccessToken', label: 'Page access token', placeholder: 'Token da pagina vinculada', type: 'password' },
      { key: 'webhookVerifyToken', label: 'Verify token do webhook', placeholder: 'token de verificacao' },
    ],
    steps: [
      'Usar conta Instagram profissional.',
      'Vincular a uma pagina do Facebook.',
      'Solicitar permissoes de mensagens no app Meta.',
      'Cadastrar os dados nesta tela para o canal ficar vinculado ao escritorio.',
    ],
  },
  facebook: {
    label: 'Facebook Messenger',
    cost: 'Sem custo direto de API, mas exige app Meta, pagina e permissoes.',
    description: 'Usa Messenger Platform para mensagens da pagina.',
    docsUrl: 'https://developers.facebook.com/docs/messenger-platform',
    fields: [
      { key: 'pageId', label: 'Facebook Page ID', placeholder: 'ID da pagina' },
      { key: 'appId', label: 'Meta App ID', placeholder: 'ID do aplicativo Meta' },
      { key: 'pageAccessToken', label: 'Page access token', placeholder: 'Token da pagina', type: 'password' },
      { key: 'appSecret', label: 'App secret', placeholder: 'Segredo do app Meta', type: 'password' },
      { key: 'webhookVerifyToken', label: 'Verify token do webhook', placeholder: 'token de verificacao' },
    ],
    steps: [
      'Criar app no Meta for Developers.',
      'Conectar uma pagina Facebook.',
      'Configurar webhooks e permissoes de mensagens.',
      'Cadastrar token e dados nesta tela para o canal ficar vinculado ao escritorio.',
    ],
  },
}

const documentExamples = [
  'DARF / DAS / GPS',
  'Holerite / folha de pagamento',
  'Pro-labore',
  'Notas fiscais',
  'Contrato social',
  'CNPJ / cartao CNPJ',
  'Certidoes negativas',
  'Balanco patrimonial',
  'DRE',
  'Declaracao de faturamento',
  'IRPF / IRPJ',
  'Comprovantes de impostos pagos',
  'Livro caixa',
  'Guias de FGTS e INSS',
]

const initialChannelForm = (provider: OmnichannelProvider = 'telegram'): ChannelForm => ({
  provider,
  displayName: '',
  status: 'Nao configurado',
  webhookUrl: '',
  secretReference: '',
  config: {},
  notes: '',
})

const initialAgentForm: AgentForm = {
  name: 'Agente contabil',
  roleTitle: 'Atendimento inicial',
  tone: 'Profissional, claro e cordial',
  instructions:
    'Receba o cliente, identifique o pedido, procure documentos disponiveis no sistema e encaminhe para atendimento humano quando nao tiver certeza.',
  canSendDocuments: true,
  active: true,
}

const initialTemplateForm: TemplateForm = {
  title: 'Saudacao inicial',
  triggerPhrase: 'Bom dia',
  responseText: 'Bom dia, tudo bem? Como posso te ajudar hoje?\n\n1 - Guias e impostos\n2 - Notas fiscais\n3 - Folha / holerite\n4 - Contrato social\n5 - Certidoes\n6 - Falar com atendente',
  sortOrder: 1,
  active: true,
}

function getDefaultTelegramWebhookUrl() {
  if (typeof window === 'undefined') {
    return 'https://cont-hub.vercel.app/api/webhooks/telegram'
  }

  return `${window.location.origin}/api/webhooks/telegram`
}

function createTelegramSecret() {
  return `telegram-${Date.now().toString(36)}`
}

function buildTelegramWebhookCommand(channelForm: ChannelForm) {
  const token = channelForm.config.botToken || 'TOKEN_DO_BOT'
  const webhookUrl = channelForm.webhookUrl || getDefaultTelegramWebhookUrl()
  const webhookSecret = channelForm.config.webhookSecret || 'SECRET_DO_WEBHOOK'

  return `$TOKEN="${token}"
$WEBHOOK="${webhookUrl}"
$SECRET="${webhookSecret}"

Invoke-RestMethod -Method Post \`
  -Uri "https://api.telegram.org/bot$TOKEN/setWebhook" \`
  -Body @{
    url=$WEBHOOK
    secret_token=$SECRET
    allowed_updates='["message","callback_query"]'
    drop_pending_updates=$true
  }`
}

const menuItems: Array<{ id: OmnichannelSection; label: string; description: string }> = [
  { id: 'atendimento', label: 'Atendimento', description: 'Inbox dos canais conectados.' },
  { id: 'configuracoes', label: 'Configuracoes API', description: 'Telegram, WhatsApp, Instagram e Facebook.' },
  { id: 'agentes', label: 'Agentes de IA', description: 'Regras e permissao para documentos.' },
  { id: 'mensagens', label: 'Mensagens padrao', description: 'Respostas e menus editaveis.' },
]

export function Omnichannel() {
  const navigate = useNavigate()
  const { logout, user } = useAuth()
  const [section, setSection] = useState<OmnichannelSection>('configuracoes')
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [channels, setChannels] = useState<OmnichannelChannel[]>([])
  const [agents, setAgents] = useState<AiAgent[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [conversations, setConversations] = useState<Awaited<ReturnType<typeof listOmnichannelConversations>>>([])
  const [messages, setMessages] = useState<OmnichannelMessage[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [channelForm, setChannelForm] = useState<ChannelForm>(initialChannelForm())
  const [agentForm, setAgentForm] = useState<AgentForm>(initialAgentForm)
  const [templateForm, setTemplateForm] = useState<TemplateForm>(initialTemplateForm)
  const [replyText, setReplyText] = useState('')
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [isSendingReply, setIsSendingReply] = useState(false)
  const [isActivatingWebhook, setIsActivatingWebhook] = useState(false)

  const selectedProvider = providerDefinitions[channelForm.provider]
  const activeChannelCount = useMemo(
    () => channels.filter((channel) => channel.status === 'Ativo').length,
    [channels],
  )
  const selectedConversation = useMemo(
    () =>
      (selectedConversationId
        ? conversations.find((conversation) => conversation.id === selectedConversationId)
        : conversations[0]) ?? null,
    [conversations, selectedConversationId],
  )
  const selectedConversationKey = selectedConversation?.id ?? null
  const telegramWebhookCommand = useMemo(
    () => buildTelegramWebhookCommand(channelForm),
    [channelForm],
  )

  const reload = useCallback(async (targetOrganizationId = organizationId) => {
    if (!targetOrganizationId) return
    const [loadedChannels, loadedAgents, loadedTemplates, loadedConversations] = await Promise.all([
      listOmnichannelChannels(targetOrganizationId),
      listAiAgents(targetOrganizationId),
      listMessageTemplates(targetOrganizationId),
      listOmnichannelConversations(targetOrganizationId),
    ])
    setChannels(loadedChannels)
    setAgents(loadedAgents)
    setTemplates(loadedTemplates)
    setConversations(loadedConversations)
  }, [organizationId])

  const loadMessages = useCallback(async (conversationId = selectedConversationKey) => {
    if (!conversationId) {
      setMessages([])
      return
    }

    setMessages(await listOmnichannelMessages(conversationId))
  }, [selectedConversationKey])

  useEffect(() => {
    let active = true

    const request = selectedConversationKey
      ? listOmnichannelMessages(selectedConversationKey)
      : Promise.resolve([])

    void request
      .then((loadedMessages) => {
        if (active) setMessages(loadedMessages)
      })
      .catch(() => {
        if (active) setMessages([])
      })

    return () => {
      active = false
    }
  }, [selectedConversationKey])

  useEffect(() => {
    if (section !== 'atendimento' || !organizationId) return

    const interval = window.setInterval(() => {
      void reload(organizationId)
      if (selectedConversationKey) {
        void listOmnichannelMessages(selectedConversationKey)
          .then(setMessages)
          .catch(() => undefined)
      }
    }, 8000)

    return () => window.clearInterval(interval)
  }, [organizationId, reload, section, selectedConversationKey])

  useEffect(() => {
    let active = true

    resolveOrganizationId()
      .then(async (id) => {
        if (!active) return
        setOrganizationId(id)
        await reload(id)
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar omnichannel.')
      })

    return () => {
      active = false
    }
  }, [reload])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  async function handleRefreshInbox() {
    try {
      await reload()
      await loadMessages()
      setFeedback('Atendimentos atualizados.')
      setError('')
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Nao foi possivel atualizar os atendimentos.')
    }
  }

  async function handleSendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedConversationKey) {
      setError('Selecione uma conversa antes de enviar.')
      return
    }

    if (!replyText.trim()) {
      setError('Digite uma mensagem para enviar.')
      return
    }

    setIsSendingReply(true)
    try {
      await sendOmnichannelMessage(selectedConversationKey, replyText)
      setReplyText('')
      await reload()
      await loadMessages(selectedConversationKey)
      setFeedback('Mensagem enviada.')
      setError('')
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Nao foi possivel enviar a mensagem.')
      setFeedback('')
    } finally {
      setIsSendingReply(false)
    }
  }

  function updateChannelConfig(key: string, value: string) {
    setChannelForm((current) => ({
      ...current,
      config: { ...current.config, [key]: value },
    }))
    setError('')
  }

  function fillTelegramDefaults() {
    setChannelForm((current) => ({
      ...current,
      webhookUrl: current.webhookUrl || getDefaultTelegramWebhookUrl(),
      secretReference: current.secretReference || 'vault://cont-hub/telegram-token',
      config: {
        ...current.config,
        webhookSecret: current.config.webhookSecret || createTelegramSecret(),
      },
    }))
    setFeedback('Webhook e secret sugeridos para Telegram.')
    setError('')
  }

  async function copyTelegramCommand() {
    try {
      await window.navigator.clipboard.writeText(telegramWebhookCommand)
      setFeedback('Comando setWebhook copiado.')
      setError('')
    } catch {
      setError('Nao foi possivel copiar automaticamente. Copie o comando exibido na tela.')
    }
  }

  async function handleActivateTelegramWebhook() {
    if (channelForm.provider !== 'telegram') return

    const botToken = channelForm.config.botToken?.trim() ?? ''
    const webhookSecret = channelForm.config.webhookSecret?.trim() ?? ''
    const webhookUrl = channelForm.webhookUrl.trim()

    if (!botToken || !webhookSecret || !webhookUrl) {
      setError('Informe Token do bot, URL do webhook e Secret do webhook antes de ativar.')
      setFeedback('')
      return
    }

    setIsActivatingWebhook(true)
    try {
      await activateTelegramWebhook({ botToken, webhookSecret, webhookUrl })
      setFeedback('Webhook do Telegram ativado automaticamente.')
      setError('')
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : 'Nao foi possivel ativar o webhook.')
      setFeedback('')
    } finally {
      setIsActivatingWebhook(false)
    }
  }

  async function handleSaveChannel() {
    if (!organizationId) {
      setError('Nenhum escritorio vinculado ao usuario.')
      return
    }

    if (!channelForm.displayName) {
      setError('Informe um nome para esta integracao.')
      return
    }

    try {
      await saveOmnichannelChannel(organizationId, channelForm, editingChannelId)
      setFeedback('Configuracao do canal salva.')
      setEditingChannelId(null)
      setChannelForm(initialChannelForm(channelForm.provider))
      await reload(organizationId)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar canal.')
    }
  }

  function editChannel(channel: OmnichannelChannel) {
    setEditingChannelId(channel.id)
    setChannelForm({
      provider: channel.provider,
      displayName: channel.displayName,
      status: channel.status,
      webhookUrl: channel.webhookUrl,
      secretReference: channel.secretReference,
      config: channel.config,
      notes: channel.notes,
    })
    setSection('configuracoes')
    setFeedback(`Editando ${providerDefinitions[channel.provider].label}.`)
  }

  async function removeChannel(channelId: string) {
    if (!window.confirm('Excluir esta configuracao de API?')) return

    try {
      await deleteOmnichannelChannel(channelId)
      await reload()
      setFeedback('Canal excluido.')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Erro ao excluir canal.')
    }
  }

  async function handleSaveAgent() {
    if (!organizationId) return
    if (!agentForm.name || !agentForm.instructions) {
      setError('Informe nome e instrucoes do agente.')
      return
    }

    try {
      await saveAiAgent(organizationId, agentForm, editingAgentId)
      setFeedback('Agente salvo.')
      setEditingAgentId(null)
      setAgentForm(initialAgentForm)
      await reload(organizationId)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar agente.')
    }
  }

  async function handleSaveTemplate() {
    if (!organizationId) return
    if (!templateForm.title || !templateForm.responseText) {
      setError('Informe titulo e texto da mensagem padrao.')
      return
    }

    try {
      await saveMessageTemplate(organizationId, templateForm, editingTemplateId)
      setFeedback('Mensagem padrao salva.')
      setEditingTemplateId(null)
      setTemplateForm(initialTemplateForm)
      await reload(organizationId)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar mensagem.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className="hidden w-72 shrink-0 flex-col bg-slate-950 px-5 py-6 text-white lg:flex">
        <Link className="mb-10 flex items-center gap-3" to="/aplicativos">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500 text-xl font-bold">A</span>
          <span>
            <span className="block text-lg font-semibold">CONT HUB Chats</span>
            <span className="block text-xs text-slate-400">Omnichannel</span>
          </span>
        </Link>
        <nav className="space-y-2 text-sm">
          {menuItems.map((item) => (
            <button
              className={`w-full rounded-2xl px-4 py-4 text-left transition ${
                section === item.id ? 'bg-indigo-500/20 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
              key={item.id}
              onClick={() => setSection(item.id)}
              type="button"
            >
              <span className="block font-semibold">{item.label}</span>
              <span className="mt-1 block text-xs text-slate-400">{item.description}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
          <p className="font-medium text-white">{user?.name}</p>
          <p className="mt-1 truncate text-xs text-slate-400">{user?.email}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Omnichannel</p>
            <h1 className="text-xl font-semibold text-slate-900">Apps de Chats</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link className="hidden text-sm font-semibold text-indigo-600 hover:text-indigo-700 sm:inline" to="/aplicativos">
              Voltar aos aplicativos
            </Link>
            <Button onClick={handleLogout} variant="secondary">Sair</Button>
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-8">
          <div className="mb-7 grid gap-4 md:grid-cols-3">
            <MetricCard label="Canais ativos" value={String(activeChannelCount)} />
            <MetricCard label="Agentes de IA" value={String(agents.filter((agent) => agent.active).length)} />
            <MetricCard label="Mensagens padrao" value={String(templates.length)} />
          </div>

          {feedback && <div className="mb-5"><Alert type="success">{feedback}</Alert></div>}
          {error && <div className="mb-5"><Alert type="error">{error}</Alert></div>}

          {section === 'atendimento' && (
            <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Caixa de entrada</h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Contatos que enviaram mensagem para os canais conectados.
                    </p>
                  </div>
                  <Button onClick={() => void handleRefreshInbox()} type="button" variant="secondary">
                    Atualizar
                  </Button>
                </div>
                <div className="mt-6 space-y-3">
                  {conversations.map((conversation) => (
                    <button
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        selectedConversationKey === conversation.id
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100'
                          : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                      }`}
                      key={conversation.id}
                      onClick={() => setSelectedConversationId(conversation.id)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-slate-900">{conversation.contactName || 'Contato'}</p>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                          {providerDefinitions[conversation.provider].label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{conversation.contactHandle}</p>
                      <p className="mt-3 line-clamp-2 text-sm text-slate-500">{conversation.lastMessagePreview}</p>
                      <p className="mt-3 text-xs text-slate-400">{formatMessageTime(conversation.lastMessageAt)}</p>
                    </button>
                  ))}
                  {conversations.length === 0 && (
                    <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                      Nenhuma conversa recebida ainda. Envie uma mensagem para o bot e clique em Atualizar.
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                {selectedConversation ? (
                  <div className="flex min-h-[520px] flex-col">
                    <div className="border-b border-slate-100 pb-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-xl font-bold text-slate-900">
                            {selectedConversation.contactName || 'Contato Telegram'}
                          </h2>
                          <p className="mt-1 text-sm text-slate-500">
                            {selectedConversation.contactHandle} - {providerDefinitions[selectedConversation.provider].label}
                          </p>
                        </div>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          {selectedConversation.status}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 flex-1 space-y-3 overflow-y-auto rounded-3xl bg-slate-50 p-4">
                      {messages.map((message) => {
                        const outgoing = message.direction !== 'entrada'

                        return (
                          <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`} key={message.id}>
                            <div
                              className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                                outgoing
                                  ? 'bg-indigo-600 text-white'
                                  : 'border border-slate-100 bg-white text-slate-700'
                              }`}
                            >
                              <p className={`mb-1 text-xs font-semibold ${outgoing ? 'text-indigo-100' : 'text-slate-400'}`}>
                                {message.senderName || (outgoing ? 'Atendente' : selectedConversation.contactName)}
                              </p>
                              <p className="whitespace-pre-wrap leading-6">{message.body}</p>
                              <p className={`mt-2 text-right text-[11px] ${outgoing ? 'text-indigo-100' : 'text-slate-400'}`}>
                                {formatMessageTime(message.createdAt)}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                      {messages.length === 0 && (
                        <p className="rounded-2xl bg-white p-5 text-center text-sm text-slate-500">
                          Nenhuma mensagem carregada para esta conversa.
                        </p>
                      )}
                    </div>

                    <form className="mt-5 flex gap-3" onSubmit={handleSendReply}>
                      <textarea
                        className="min-h-14 flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                        onChange={(event) => setReplyText(event.target.value)}
                        placeholder="Digite a resposta para enviar pelo Telegram..."
                        value={replyText}
                      />
                      <Button className="self-end px-6" isLoading={isSendingReply} type="submit">
                        Enviar
                      </Button>
                    </form>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="font-semibold text-slate-900">Selecione uma conversa.</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Quando alguém mandar mensagem para o bot, o contato aparece na caixa de entrada.
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {section === 'configuracoes' && (
            <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">APIs</p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-900">Configuracao dos canais</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Configure tudo por aqui. Cada contador salva e visualiza apenas os canais do proprio escritorio.
                  </p>
                  <p className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Para MVP, os tokens ficam salvos no cadastro do canal com acesso protegido por login e RLS.
                    Em producao, o ideal e criptografar esses segredos em backend/cofre.
                  </p>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Select
                    id="provider"
                    label="Canal"
                    onChange={(value) => setChannelForm(initialChannelForm(value as OmnichannelProvider))}
                    value={channelForm.provider}
                  >
                    {(Object.keys(providerDefinitions) as OmnichannelProvider[]).map((provider) => (
                      <option key={provider} value={provider}>{providerDefinitions[provider].label}</option>
                    ))}
                  </Select>
                  <Select
                    id="status"
                    label="Status"
                    onChange={(value) => setChannelForm((current) => ({ ...current, status: value as OmnichannelStatus }))}
                    value={channelForm.status}
                  >
                    {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </Select>
                  <Input
                    id="display-name"
                    label="Nome da integracao"
                    onChange={(event) => setChannelForm((current) => ({ ...current, displayName: event.target.value }))}
                    placeholder="Ex: Telegram suporte"
                    value={channelForm.displayName}
                  />
                  <Input
                    id="webhook-url"
                    label="URL do webhook"
                    onChange={(event) => setChannelForm((current) => ({ ...current, webhookUrl: event.target.value }))}
                    placeholder="https://api.seudominio.com/webhooks/telegram"
                    value={channelForm.webhookUrl}
                  />
                  <Input
                    id="secret-reference"
                    label="Referencia do segredo"
                    onChange={(event) => setChannelForm((current) => ({ ...current, secretReference: event.target.value }))}
                    placeholder="Ex: vault://cont-hub/telegram-token"
                    value={channelForm.secretReference}
                  />
                  {selectedProvider.fields.map((field) => (
                    <Input
                      id={field.key}
                      key={field.key}
                      label={field.label}
                      autoComplete="off"
                      onChange={(event) => updateChannelConfig(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      type={field.type ?? 'text'}
                      value={channelForm.config[field.key] ?? ''}
                    />
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  <label className="block text-sm font-medium text-slate-700" htmlFor="channel-notes">Observacoes</label>
                  <textarea
                    className="min-h-28 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                    id="channel-notes"
                    onChange={(event) => setChannelForm((current) => ({ ...current, notes: event.target.value }))}
                    value={channelForm.notes}
                  />
                </div>
                {channelForm.provider === 'telegram' && (
                  <div className="mt-5 rounded-3xl border border-indigo-100 bg-indigo-50 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Configuracao rapida Telegram</h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                          Cada contador cria o proprio bot no BotFather. A URL do webhook pode ser a mesma,
                          mas o token e o secret devem ser exclusivos por escritorio.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={fillTelegramDefaults} type="button" variant="secondary">
                          Preencher webhook
                        </Button>
                        <Button
                          isLoading={isActivatingWebhook}
                          onClick={() => void handleActivateTelegramWebhook()}
                          type="button"
                        >
                          Ativar webhook
                        </Button>
                        <Button onClick={() => void copyTelegramCommand()} type="button" variant="secondary">
                          Copiar comando manual
                        </Button>
                      </div>
                    </div>
                    <ol className="mt-4 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                      <li className="rounded-2xl bg-white/80 px-4 py-3">1. No Telegram, abra @BotFather e crie ou selecione o bot.</li>
                      <li className="rounded-2xl bg-white/80 px-4 py-3">2. Copie o API Token e cole no campo Token do bot.</li>
                      <li className="rounded-2xl bg-white/80 px-4 py-3">3. Salve o canal como Ativo nesta tela.</li>
                      <li className="rounded-2xl bg-white/80 px-4 py-3">4. Clique em Ativar webhook para conectar automaticamente.</li>
                    </ol>
                    <p className="mt-4 rounded-2xl bg-white/80 px-4 py-3 text-sm text-slate-600">
                      O comando abaixo fica como alternativa tecnica. Para o contador, o caminho recomendado e usar o botao
                      <strong> Ativar webhook</strong>.
                    </p>
                    <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                      {telegramWebhookCommand}
                    </pre>
                    <p className="mt-3 text-xs leading-5 text-indigo-900">
                      O bot/token individual continua necessario para separar os atendimentos de cada escritorio.
                    </p>
                  </div>
                )}
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button onClick={() => void handleSaveChannel()}>{editingChannelId ? 'Atualizar canal' : 'Salvar canal'}</Button>
                  {editingChannelId && (
                    <Button onClick={() => { setEditingChannelId(null); setChannelForm(initialChannelForm(channelForm.provider)) }} variant="secondary">
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>

              <aside className="space-y-5">
                <InfoPanel provider={channelForm.provider} />
                <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900">Canais cadastrados</h3>
                  <div className="mt-4 space-y-3">
                    {channels.map((channel) => (
                      <article className="rounded-2xl border border-slate-100 p-4" key={channel.id}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-slate-900">{channel.displayName}</p>
                          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                            {providerDefinitions[channel.provider].label}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">{channel.status}</p>
                        <div className="mt-4 flex gap-4 text-sm font-semibold">
                          <button className="text-indigo-600" onClick={() => editChannel(channel)} type="button">Editar</button>
                          <button className="text-rose-600" onClick={() => void removeChannel(channel.id)} type="button">Excluir</button>
                        </div>
                      </article>
                    ))}
                    {channels.length === 0 && <p className="text-sm text-slate-500">Nenhum canal cadastrado.</p>}
                  </div>
                </div>
              </aside>
            </section>
          )}

          {section === 'agentes' && (
            <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-bold text-slate-900">Agentes de IA</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Configure o comportamento do agente. O envio real de documentos deve passar pelo backend.
                </p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <Input id="agent-name" label="Nome do agente" onChange={(event) => setAgentForm((current) => ({ ...current, name: event.target.value }))} value={agentForm.name} />
                  <Input id="agent-role" label="Funcao" onChange={(event) => setAgentForm((current) => ({ ...current, roleTitle: event.target.value }))} value={agentForm.roleTitle} />
                  <Input id="agent-tone" label="Tom de atendimento" onChange={(event) => setAgentForm((current) => ({ ...current, tone: event.target.value }))} value={agentForm.tone} />
                  <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                    <input
                      checked={agentForm.canSendDocuments}
                      onChange={(event) => setAgentForm((current) => ({ ...current, canSendDocuments: event.target.checked }))}
                      type="checkbox"
                    />
                    Pode localizar e enviar documentos
                  </label>
                </div>
                <div className="mt-4 space-y-2">
                  <label className="block text-sm font-medium text-slate-700" htmlFor="agent-instructions">Parametros do agente</label>
                  <textarea
                    className="min-h-36 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                    id="agent-instructions"
                    onChange={(event) => setAgentForm((current) => ({ ...current, instructions: event.target.value }))}
                    value={agentForm.instructions}
                  />
                </div>
                <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <input
                    checked={agentForm.active}
                    onChange={(event) => setAgentForm((current) => ({ ...current, active: event.target.checked }))}
                    type="checkbox"
                  />
                  Agente ativo
                </label>
                <div className="mt-6 flex gap-3">
                  <Button onClick={() => void handleSaveAgent()}>{editingAgentId ? 'Atualizar agente' : 'Salvar agente'}</Button>
                  {editingAgentId && <Button onClick={() => { setEditingAgentId(null); setAgentForm(initialAgentForm) }} variant="secondary">Cancelar</Button>}
                </div>
              </div>
              <aside className="space-y-5">
                <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900">Documentos que o agente pode buscar</h3>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {documentExamples.map((documentName) => (
                      <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600" key={documentName}>{documentName}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900">Agentes cadastrados</h3>
                  <div className="mt-4 space-y-3">
                    {agents.map((agent) => (
                      <article className="rounded-2xl border border-slate-100 p-4" key={agent.id}>
                        <p className="font-semibold text-slate-900">{agent.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{agent.roleTitle}</p>
                        <div className="mt-4 flex gap-4 text-sm font-semibold">
                          <button className="text-indigo-600" onClick={() => { setEditingAgentId(agent.id); setAgentForm({ ...agent }); }} type="button">Editar</button>
                          <button className="text-rose-600" onClick={() => void deleteAiAgent(agent.id).then(() => reload())} type="button">Excluir</button>
                        </div>
                      </article>
                    ))}
                    {agents.length === 0 && <p className="text-sm text-slate-500">Nenhum agente cadastrado.</p>}
                  </div>
                </div>
              </aside>
            </section>
          )}

          {section === 'mensagens' && (
            <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
              <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-bold text-slate-900">Mensagens padrao</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Crie respostas prontas e menus para o agente usar antes de chamar um humano.
                </p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <Input id="template-title" label="Titulo" onChange={(event) => setTemplateForm((current) => ({ ...current, title: event.target.value }))} value={templateForm.title} />
                  <Input id="template-trigger" label="Frase gatilho" onChange={(event) => setTemplateForm((current) => ({ ...current, triggerPhrase: event.target.value }))} value={templateForm.triggerPhrase} />
                  <Input id="template-order" label="Ordem" onChange={(event) => setTemplateForm((current) => ({ ...current, sortOrder: Number(event.target.value || 0) }))} type="number" value={templateForm.sortOrder} />
                  <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                    <input
                      checked={templateForm.active}
                      onChange={(event) => setTemplateForm((current) => ({ ...current, active: event.target.checked }))}
                      type="checkbox"
                    />
                    Mensagem ativa
                  </label>
                </div>
                <div className="mt-4 space-y-2">
                  <label className="block text-sm font-medium text-slate-700" htmlFor="template-response">Texto da resposta</label>
                  <textarea
                    className="min-h-44 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                    id="template-response"
                    onChange={(event) => setTemplateForm((current) => ({ ...current, responseText: event.target.value }))}
                    value={templateForm.responseText}
                  />
                </div>
                <div className="mt-6 flex gap-3">
                  <Button onClick={() => void handleSaveTemplate()}>{editingTemplateId ? 'Atualizar mensagem' : 'Salvar mensagem'}</Button>
                  {editingTemplateId && <Button onClick={() => { setEditingTemplateId(null); setTemplateForm(initialTemplateForm) }} variant="secondary">Cancelar</Button>}
                </div>
              </div>
              <aside className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900">Mensagens cadastradas</h3>
                <div className="mt-4 space-y-3">
                  {templates.map((template) => (
                    <article className="rounded-2xl border border-slate-100 p-4" key={template.id}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-slate-900">{template.title}</p>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                          #{template.sortOrder}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm text-slate-500">{template.responseText}</p>
                      <div className="mt-4 flex gap-4 text-sm font-semibold">
                        <button className="text-indigo-600" onClick={() => { setEditingTemplateId(template.id); setTemplateForm({ ...template }); }} type="button">Editar</button>
                        <button className="text-rose-600" onClick={() => void deleteMessageTemplate(template.id).then(() => reload())} type="button">Excluir</button>
                      </div>
                    </article>
                  ))}
                  {templates.length === 0 && <p className="text-sm text-slate-500">Nenhuma mensagem padrao cadastrada.</p>}
                </div>
              </aside>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
    </div>
  )
}

function formatMessageTime(value: string) {
  if (!value) return ''

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

function InfoPanel({ provider }: { provider: OmnichannelProvider }) {
  const definition = providerDefinitions[provider]

  return (
    <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700">i</span>
          <h3 className="mt-3 text-lg font-bold text-slate-900">Como configurar {definition.label}</h3>
        </div>
      </div>
      <p className="text-sm font-semibold text-indigo-700">{definition.cost}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{definition.description}</p>
      {provider === 'telegram' && (
        <div className="mt-4 rounded-2xl bg-white/80 p-4 text-sm leading-6 text-slate-600">
          <p className="font-semibold text-slate-900">Para sistema escalavel</p>
          <p className="mt-1">
            Cada contador configura o proprio bot. Isso separa mensagens, token e atendimento por escritorio.
            A URL do webhook pode continuar unica no CONT HUB.
          </p>
        </div>
      )}
      <ol className="mt-4 space-y-2 text-sm text-slate-600">
        {definition.steps.map((step, index) => (
          <li className="rounded-2xl bg-white/70 px-4 py-3" key={step}>
            {index + 1}. {step}
          </li>
        ))}
      </ol>
      <a className="mt-5 inline-flex text-sm font-semibold text-indigo-700" href={definition.docsUrl} rel="noreferrer" target="_blank">
        Abrir documentacao oficial
      </a>
    </div>
  )
}

function Select({
  children,
  id,
  label,
  onChange,
  value,
}: {
  children: React.ReactNode
  id: string
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>{label}</label>
      <select
        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </div>
  )
}
