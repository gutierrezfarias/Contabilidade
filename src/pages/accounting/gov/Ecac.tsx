import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DashboardLayout } from '../../../components/layout/DashboardLayout'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import {
  listAccountingClients,
  listCertificates,
  listCertificateServices,
} from '../../../services/accountingRepository'
import { resolveOrganizationId } from '../../../services/platformService'
import type {
  AccountingClient,
  CertificateServiceCode,
  DigitalCertificate,
} from '../../../types/accounting'

const ecacServices: Array<{ code: CertificateServiceCode; title: string; description: string; resultLabel: string }> = [
  {
    code: 'ecac_caixa_postal',
    title: 'Caixa postal e DTE',
    description: 'Mensagens, comunicacoes, intimacoes e domicilio tributario eletronico.',
    resultLabel: 'Mensagens e intimacoes',
  },
  {
    code: 'ecac_situacao_fiscal',
    title: 'Situacao fiscal',
    description: 'Pendencias, relatorios fiscais, debitos e acompanhamento de regularidade.',
    resultLabel: 'Resumo fiscal do contribuinte',
  },
  {
    code: 'ecac_certidoes',
    title: 'Certidoes',
    description: 'CND/regularidade fiscal e validacoes quando disponiveis no portal.',
    resultLabel: 'Certidoes disponiveis',
  },
  {
    code: 'ecac_processos_digitais',
    title: 'Processos digitais',
    description: 'Abertura, acompanhamento, juntada e consulta de processos/requerimentos.',
    resultLabel: 'Processos e protocolos',
  },
  {
    code: 'ecac_dctfweb',
    title: 'DCTFWeb',
    description: 'Declaracoes, guias, debitos previdenciarios e transmissao quando autorizado.',
    resultLabel: 'Declaracoes e guias',
  },
  {
    code: 'ecac_perdcomp',
    title: 'PER/DCOMP',
    description: 'Restituicao, ressarcimento, reembolso e compensacao.',
    resultLabel: 'Pedidos e compensacoes',
  },
  {
    code: 'sped_reinf',
    title: 'EFD-Reinf',
    description: 'Acesso e transmissao com certificado digital/procuracao conforme regras da Receita.',
    resultLabel: 'Eventos EFD-Reinf',
  },
  {
    code: 'ecac',
    title: 'Acesso geral e-CAC',
    description: 'Base para autenticar o cliente com certificado/procuracao.',
    resultLabel: 'Ambiente autenticado',
  },
]

export function Ecac() {
  const [searchParams] = useSearchParams()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [clients, setClients] = useState<AccountingClient[]>([])
  const [certificates, setCertificates] = useState<DigitalCertificate[]>([])
  const [enabledServices, setEnabledServices] = useState<CertificateServiceCode[]>([])
  const [clientId, setClientId] = useState('')
  const [certificateId, setCertificateId] = useState('')
  const [activeService, setActiveService] = useState<(typeof ecacServices)[number] | null>(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const selectedCertificate = useMemo(
    () => certificates.find((certificate) => certificate.id === certificateId) ?? null,
    [certificateId, certificates],
  )
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === clientId) ?? null,
    [clientId, clients],
  )

  useEffect(() => {
    resolveOrganizationId(searchParams.get('organization'))
      .then(async (loadedOrganizationId) => {
        setOrganizationId(loadedOrganizationId)
        setClients(await listAccountingClients(loadedOrganizationId))
      })
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar clientes.'),
      )
  }, [searchParams])

  useEffect(() => {
    let active = true

    async function loadClientCertificates() {
      if (!clientId) {
        setCertificates([])
        setCertificateId('')
        setEnabledServices([])
        return
      }

      try {
        const loadedCertificates = (await listCertificates(clientId)).filter(
          (certificate) => certificate.status === 'Ativo',
        )
        if (!active) return
        setCertificates(loadedCertificates)
        setCertificateId(loadedCertificates[0]?.id ?? '')
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar certificados.')
      }
    }

    void loadClientCertificates()
    return () => {
      active = false
    }
  }, [clientId])

  useEffect(() => {
    let active = true

    async function loadServices() {
      if (!certificateId) {
        setEnabledServices([])
        return
      }

      try {
        const services = await listCertificateServices(certificateId)
        if (active) setEnabledServices(services)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar servicos.')
      }
    }

    void loadServices()
    return () => {
      active = false
    }
  }, [certificateId])

  function openService(service: (typeof ecacServices)[number]) {
    if (!organizationId || !clientId || !selectedCertificate) {
      setError('Selecione cliente e certificado ativo antes de consumir o e-CAC.')
      setFeedback('')
      return
    }

    if (!selectedCertificate.certificateFileData || !selectedCertificate.certificatePassword) {
      setError('O certificado precisa ter arquivo PFX/P12 e senha cadastrados para uso real.')
      setFeedback('')
      return
    }

    setError('')
    setFeedback(
      `${service.title} carregado para ${selectedClient?.companyName ?? selectedCertificate.holderName}.`,
    )
    setActiveService(service)
  }

  return (
    <DashboardLayout title="e-CAC">
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">e-CAC - Integracao</h2>
        <p className="mt-2 text-sm text-slate-500">
          Selecione o cliente e o certificado ativo. O sistema usa o cadastro existente do certificado para preparar os servicos.
        </p>
      </div>

      {feedback && <div className="mb-5"><Alert type="success">{feedback}</Alert></div>}
      {error && <div className="mb-5"><Alert type="error">{error}</Alert></div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-5 text-xl font-semibold text-slate-900">Credencial do cliente</h3>
        <div className="grid gap-5 md:grid-cols-2">
          <Select id="ecac-client" label="Cliente" onChange={setClientId} value={clientId}>
            <option value="">Selecione...</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.companyName}</option>)}
          </Select>
          <Select id="ecac-cert" label="Certificado digital ativo" onChange={setCertificateId} value={certificateId}>
            <option value="">Selecione apos cadastrar o certificado ativo...</option>
            {certificates.map((certificate) => (
              <option key={certificate.id} value={certificate.id}>{certificate.certificateType} - {certificate.holderName}</option>
            ))}
          </Select>
        </div>

        {selectedCertificate && (
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <StatusCard label="Arquivo" ok={Boolean(selectedCertificate.certificateFileData)} value={selectedCertificate.certificateFileName || 'Nao anexado'} />
            <StatusCard label="Senha" ok={Boolean(selectedCertificate.certificatePassword)} value={selectedCertificate.certificatePassword ? 'Cadastrada' : 'Nao cadastrada'} />
            <StatusCard label="UF" ok={Boolean(selectedCertificate.stateUf)} value={selectedCertificate.stateUf || 'Nao informada'} />
            <StatusCard label="Ambiente" ok value={selectedCertificate.environment === 'producao' ? 'Producao' : 'Homologacao'} />
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-5 text-xl font-semibold text-slate-900">Servicos habilitados no certificado</h3>
        <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50 p-5 text-sm text-indigo-800">
          O frontend seleciona cliente/certificado e mostra o que esta habilitado. A chamada real ao e-CAC
          deve passar por uma API backend que consome o certificado e registra logs.
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {ecacServices.map((service) => {
            const enabled = enabledServices.includes(service.code)
            return (
              <div className={`rounded-xl border p-5 ${enabled ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`} key={service.code}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{service.title}</p>
                    <p className="mt-2 text-sm text-slate-500">{service.description}</p>
                    <p className={`mt-3 text-xs font-semibold ${enabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {enabled ? 'Habilitado no certificado' : 'Nao habilitado no certificado'}
                    </p>
                  </div>
                  <Button
                    disabled={!enabled}
                    onClick={() => openService(service)}
                    type="button"
                    variant={enabled ? 'primary' : 'secondary'}
                  >
                    Abrir
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </section>
      {activeService && selectedCertificate && (
        <EcacServiceModal
          certificate={selectedCertificate}
          client={selectedClient}
          onClose={() => setActiveService(null)}
          service={activeService}
        />
      )}
    </DashboardLayout>
  )
}

function EcacServiceModal({
  certificate,
  client,
  onClose,
  service,
}: {
  certificate: DigitalCertificate
  client: AccountingClient | null
  onClose: () => void
  service: (typeof ecacServices)[number]
}) {
  const [actionMessage, setActionMessage] = useState('')
  const rows = getServiceRows(service.code, client, certificate)

  function runServiceAction(action: string) {
    const company = client?.companyName ?? certificate.holderName
    setActionMessage(
      `${action} preparado para ${company}. Para executar com dados reais, conecte o backend e-CAC/Receita usando este certificado.`,
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">e-CAC</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">{service.title}</h3>
            <p className="mt-2 text-sm text-slate-500">{service.description}</p>
          </div>
          <Button onClick={onClose} type="button" variant="secondary">Fechar</Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <StatusCard label="Cliente" ok={Boolean(client)} value={client?.companyName ?? certificate.holderName} />
          <StatusCard label="CNPJ/CPF" ok value={client?.cnpj || certificate.taxId} />
          <StatusCard label="Certificado" ok={Boolean(certificate.certificateFileData)} value={certificate.certificateFileName || 'Nao anexado'} />
        </div>

        <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
          <p className="font-semibold text-indigo-950">{service.resultLabel}</p>
          <p className="mt-2 text-sm text-indigo-800">
            Esta janela e o ambiente visual do servico. Quando o backend fiscal/e-CAC estiver conectado,
            os dados reais retornados pela Receita Federal entram nesta mesma area.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="font-semibold text-slate-900">Acoes do servico</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {getServiceActions(service.code).map((action) => (
              <Button key={action} onClick={() => runServiceAction(action)} type="button" variant="secondary">
                {action}
              </Button>
            ))}
          </div>
          {actionMessage && (
            <Alert type="info">
              {actionMessage}
            </Alert>
          )}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <div className="rounded-2xl border border-slate-200 p-5" key={row.title}>
              <p className="font-semibold text-slate-900">{row.title}</p>
              <p className="mt-2 text-sm text-slate-500">{row.description}</p>
              <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                row.status === 'Disponivel'
                  ? 'bg-emerald-50 text-emerald-700'
                  : row.status === 'Pendente'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-slate-100 text-slate-500'
              }`}>
                {row.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function getServiceActions(serviceCode: CertificateServiceCode) {
  const actions: Partial<Record<CertificateServiceCode, string[]>> = {
    ecac_caixa_postal: ['Consultar mensagens', 'Abrir intimacao', 'Baixar comunicacao'],
    ecac_situacao_fiscal: ['Consultar situacao fiscal', 'Baixar relatorio fiscal', 'Atualizar pendencias'],
    ecac_certidoes: ['Consultar CND / CPEND', 'Emitir certidao', 'Baixar segunda via'],
    ecac_processos_digitais: ['Listar processos', 'Abrir processo', 'Baixar protocolo'],
    ecac_dctfweb: ['Consultar DCTFWeb', 'Emitir DARF', 'Baixar comprovante'],
    ecac_perdcomp: ['Consultar PER/DCOMP', 'Abrir pedido', 'Baixar recibo'],
    sped_reinf: ['Consultar eventos', 'Enviar evento', 'Baixar recibo'],
    ecac: ['Validar acesso', 'Consultar procuracao', 'Atualizar autorizacoes'],
  }

  return actions[serviceCode] ?? ['Consultar servico', 'Atualizar dados', 'Baixar resultado']
}

function getServiceRows(
  serviceCode: CertificateServiceCode,
  client: AccountingClient | null,
  certificate: DigitalCertificate,
) {
  const company = client?.companyName ?? certificate.holderName
  const common = [
    {
      title: 'Credencial validada no sistema',
      description: `Certificado ativo para ${company}. Arquivo e senha cadastrados no modulo de clientes.`,
      status: 'Disponivel',
    },
  ]

  const specific: Record<string, Array<{ title: string; description: string; status: string }>> = {
    ecac_caixa_postal: [
      { title: 'Caixa postal', description: 'Area para listar mensagens, intimacoes e comunicados recebidos.', status: 'Pendente' },
      { title: 'DTE', description: 'Area para acompanhar domicilio tributario eletronico do contribuinte.', status: 'Pendente' },
    ],
    ecac_situacao_fiscal: [
      { title: 'Pendencias fiscais', description: 'Area para exibir debitos, divergencias e pendencias de regularidade.', status: 'Pendente' },
      { title: 'Relatorio fiscal', description: 'Area para salvar o ultimo relatorio consultado.', status: 'Pendente' },
    ],
    ecac_certidoes: [
      { title: 'CND / CPEND', description: 'Area para emitir, visualizar e baixar certidoes do contribuinte.', status: 'Pendente' },
      { title: 'Historico de certidoes', description: 'Area para guardar segunda via e data de validade.', status: 'Pendente' },
    ],
    ecac_processos_digitais: [
      { title: 'Processos abertos', description: 'Area para listar processos digitais e protocolos.', status: 'Pendente' },
      { title: 'Juntada de documentos', description: 'Area para controlar documentos enviados ao processo.', status: 'Pendente' },
    ],
    ecac_dctfweb: [
      { title: 'Declaracoes', description: 'Area para consultar DCTFWeb e situacao de transmissao.', status: 'Pendente' },
      { title: 'Guias', description: 'Area para listar DARF numerado e comprovantes.', status: 'Pendente' },
    ],
    ecac_perdcomp: [
      { title: 'Pedidos', description: 'Area para consultar pedidos de restituicao, ressarcimento e reembolso.', status: 'Pendente' },
      { title: 'Compensacoes', description: 'Area para acompanhar declaracoes de compensacao.', status: 'Pendente' },
    ],
    sped_reinf: [
      { title: 'Eventos', description: 'Area para listar eventos EFD-Reinf transmitidos ou pendentes.', status: 'Pendente' },
      { title: 'Recibos', description: 'Area para baixar recibos e consultar retorno de processamento.', status: 'Pendente' },
    ],
    ecac: [
      { title: 'Sessao autenticada', description: 'Base para centralizar acessos e permissoes do cliente.', status: 'Disponivel' },
      { title: 'Procuracao digital', description: 'Area para controlar autorizacoes do contador.', status: 'Pendente' },
    ],
  }

  return [...common, ...(specific[serviceCode] ?? [])]
}

function Select({ children, id, label, onChange, value }: { children: React.ReactNode; id: string; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>{label}</label>
      <select className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm" id={id} onChange={(event) => onChange(event.target.value)} value={value}>{children}</select>
    </div>
  )
}

function StatusCard({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-2 text-sm font-semibold ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>{value}</p>
    </div>
  )
}
