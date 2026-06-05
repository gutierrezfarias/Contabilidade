import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AccountingTabs } from '../../../components/accounting/AccountingTabs'
import { GoogleBusinessProfilePanel } from '../../../components/accounting/GoogleBusinessProfilePanel'
import { DashboardLayout } from '../../../components/layout/DashboardLayout'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useRole } from '../../../hooks/useRole'
import {
  addEmployee,
  blankCompanySettings,
  blankHomeSettings,
  blankPartner,
  deletePartner,
  loadCompanySettings,
  loadEmployees,
  loadHomeSettings,
  loadPartners,
  saveCompanySettings,
  saveHomeSettings,
  savePartner,
} from '../../../services/accountingSettingsService'
import { findAddressDetailsByCep } from '../../../services/cepService'
import { resolveOrganizationId } from '../../../services/platformService'
import type {
  AccountingCompanySettings,
  AccountingEmployee,
  CompanyPartner,
  HomeSettings,
} from '../../../types/accountingSettings'
import {
  formatCnpj,
  formatMunicipalRegistration,
  formatPhone,
  formatPostalCode,
  formatStateRegistration,
} from '../../../utils/formatters'

type SettingsTab = 'empresa' | 'funcionarios' | 'pagamento' | 'google' | 'pagina-inicial'

function getInitialSettingsTab(searchParams: URLSearchParams): SettingsTab {
  const tabFromUrl = searchParams.get('aba')
  if (tabFromUrl === 'google') return 'google'
  if (tabFromUrl === 'pagina-inicial') return 'pagina-inicial'
  return 'empresa'
}

export function AccountingSettings() {
  const [searchParams] = useSearchParams()
  const { isAdmin } = useRole()
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => getInitialSettingsTab(searchParams))
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [settings, setSettings] = useState<AccountingCompanySettings>(blankCompanySettings)
  const [employees, setEmployees] = useState<AccountingEmployee[]>([])
  const [partners, setPartners] = useState<CompanyPartner[]>([])
  const [partnerDraft, setPartnerDraft] = useState<Omit<CompanyPartner, 'organizationId'>>({
    id: '',
    ...blankPartner,
  })
  const [homeSettings, setHomeSettings] = useState<HomeSettings>(blankHomeSettings)
  const [employeeDraft, setEmployeeDraft] = useState({ name: '', role: '', email: '' })
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [isSearchingCep, setIsSearchingCep] = useState(false)
  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'empresa', label: 'Empresa' },
    { id: 'funcionarios', label: 'Funcionarios' },
    { id: 'pagamento', label: 'Pagamento' },
    { id: 'google', label: 'Google Meu Negocio' },
    ...(isAdmin ? [{ id: 'pagina-inicial' as const, label: 'Pagina inicial' }] : []),
  ]

  useEffect(() => {
    resolveOrganizationId(searchParams.get('organization'))
      .then(async (id) => {
        setOrganizationId(id)
        const [company, organizationEmployees, organizationPartners] = await Promise.all([
          loadCompanySettings(id),
          loadEmployees(id),
          loadPartners(id),
        ])
        setSettings(company)
        setEmployees(organizationEmployees)
        setPartners(organizationPartners)
      })
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar configuracoes.'),
      )
  }, [searchParams])

  useEffect(() => {
    if (!isAdmin) return
    loadHomeSettings()
      .then(setHomeSettings)
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar pagina inicial.'),
      )
  }, [isAdmin])

  function updateField(field: keyof AccountingCompanySettings, value: string) {
    const nextValue =
      field === 'cep'
        ? formatPostalCode('BR', value)
        : field === 'cnpj'
        ? formatCnpj(value)
        : field === 'phone' || field === 'whatsapp'
        ? formatPhone('BR', value)
        : field === 'state'
        ? value.toUpperCase()
        : field === 'municipalRegistration'
        ? formatMunicipalRegistration(value)
        : field === 'stateRegistration'
        ? formatStateRegistration(value)
        : value

    setSettings((current) => ({
      ...current,
      [field]: nextValue,
    }))
  }

  async function lookupCep() {
    if (settings.cep.replace(/\D/g, '').length !== 8) return

    setIsSearchingCep(true)
    try {
      const result = await findAddressDetailsByCep(settings.cep)
      setSettings((current) => ({
        ...current,
        cep: result.cep,
        address: result.address || current.address,
        addressComplement: result.complement || current.addressComplement,
        neighborhood: result.neighborhood || current.neighborhood,
        city: result.city || current.city,
        state: result.state || current.state,
      }))
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'Erro ao consultar CEP.')
    } finally {
      setIsSearchingCep(false)
    }
  }

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo.'))
      reader.readAsDataURL(file)
    })
  }

  async function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Selecione uma imagem para o logo.')
      event.target.value = ''
      return
    }

    if (file.size > 1_500_000) {
      setError('Use uma imagem com ate 1.5 MB para salvar direto na tabela.')
      event.target.value = ''
      return
    }

    try {
      updateField('logoData', await readFileAsDataUrl(file))
      setFeedback('Logo carregado. Clique em salvar para gravar.')
      setError('')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Nao foi possivel carregar o logo.')
    }
  }

  function updatePartner(field: keyof Omit<CompanyPartner, 'organizationId'>, value: string) {
    setPartnerDraft((current) => ({ ...current, [field]: value }))
  }

  async function handlePartnerProofUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 1_500_000) {
      setError('Use um comprovante com ate 1.5 MB para salvar direto na tabela.')
      event.target.value = ''
      return
    }

    try {
      const residenceProofData = await readFileAsDataUrl(file)
      setPartnerDraft((current) => ({
        ...current,
        residenceProofData,
        residenceProofName: file.name,
      }))
      setError('')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Nao foi possivel carregar o comprovante.')
    }
  }

  async function handleSavePartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!organizationId || !partnerDraft.name) {
      setError('Informe o nome do socio antes de salvar.')
      return
    }

    try {
      await savePartner(organizationId, partnerDraft)
      setPartners(await loadPartners(organizationId))
      setPartnerDraft({ id: '', ...blankPartner })
      setFeedback('Socio salvo com sucesso.')
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar socio.')
    }
  }

  async function removePartner(partnerId: string) {
    if (!window.confirm('Excluir este socio?')) return

    try {
      await deletePartner(partnerId)
      setPartners(await loadPartners(organizationId))
      setFeedback('Socio excluido.')
      setError('')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Erro ao excluir socio.')
    }
  }

  function extractValue(text: string, labels: string[]) {
    const lines = text
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    for (const label of labels) {
      const index = lines.findIndex((line) => line.toUpperCase().includes(label))
      if (index >= 0) {
        const inlineValue = lines[index].split(':').slice(1).join(':').trim()
        if (inlineValue) return inlineValue
        return lines[index + 1] ?? ''
      }
    }

    return ''
  }

  function applyCnpjDocumentExtraction(text: string) {
    const cnpjMatch = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)
    const companyName = extractValue(text, ['NOME EMPRESARIAL'])
    const cep = extractValue(text, ['CEP'])
    const address = extractValue(text, ['LOGRADOURO'])
    const complement = extractValue(text, ['COMPLEMENTO'])
    const neighborhood = extractValue(text, ['BAIRRO'])
    const city = extractValue(text, ['MUNICIPIO', 'MUNICÍPIO'])
    const state = extractValue(text, ['UF'])

    setSettings((current) => ({
      ...current,
      cnpj: cnpjMatch ? formatCnpj(cnpjMatch[0]) : current.cnpj,
      companyName: companyName || current.companyName,
      cep: cep ? formatPostalCode('BR', cep) : current.cep,
      address: address || current.address,
      addressComplement: complement || current.addressComplement,
      neighborhood: neighborhood || current.neighborhood,
      city: city || current.city,
      state: state || current.state,
    }))
  }

  async function handleCnpjDocumentUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 2_000_000) {
      setError('Use um documento com ate 2 MB para salvar direto na tabela.')
      event.target.value = ''
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const text = file.type.startsWith('text/') ? await file.text() : ''
      setSettings((current) => ({
        ...current,
        cnpjDocumentData: dataUrl,
        cnpjDocumentName: file.name,
        cnpjDocumentText: text,
      }))

      if (text) {
        applyCnpjDocumentExtraction(text)
        setFeedback('Documento lido e campos preenchidos quando encontrados.')
      } else {
        setFeedback('Documento anexado. Para leitura real de PDF/imagem por IA, configure um backend OCR/IA.')
      }
      setError('')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Nao foi possivel carregar o documento.')
    }
  }

  async function saveSettings() {
    if (!organizationId) {
      setError('Nenhum escritorio esta vinculado a este ambiente.')
      return
    }

    try {
      await saveCompanySettings(organizationId, settings)
      setFeedback('Configuracoes da empresa salvas.')
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar.')
    }
  }

  async function handleAddEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!organizationId || !employeeDraft.name || !employeeDraft.email) {
      setError('Informe nome e e-mail do funcionario.')
      return
    }

    try {
      await addEmployee(organizationId, employeeDraft)
      setEmployees(await loadEmployees(organizationId))
      setEmployeeDraft({ name: '', role: '', email: '' })
      setFeedback('Funcionario cadastrado.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar funcionario.')
    }
  }

  async function handleSaveHome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await saveHomeSettings(homeSettings)
      setFeedback('Pagina inicial atualizada.')
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar pagina inicial.')
    }
  }

  return (
    <DashboardLayout title="Configuracoes">
      <h2 className="mb-8 text-3xl font-bold tracking-tight text-slate-900">Configuracoes</h2>
      <AccountingTabs activeTab={activeTab} onChange={setActiveTab} tabs={tabs} />
      {feedback && <div className="mt-6"><Alert type="success">{feedback}</Alert></div>}
      {error && <div className="mt-6"><Alert type="error">{error}</Alert></div>}

      {activeTab === 'empresa' && (
        <div className="mt-4 space-y-7">
          <Panel title="Informacoes Basicas da Empresa">
            <Grid>
              <Input id="settings-company" label="Nome da Empresa" onChange={(event) => updateField('companyName', event.target.value)} value={settings.companyName} />
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700" htmlFor="settings-logo">
                  Logo da empresa
                </label>
                <input
                  accept="image/*"
                  className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                  id="settings-logo"
                  onChange={(event) => void handleLogoUpload(event)}
                  type="file"
                />
                {settings.logoData && (
                  <div className="mt-3 flex items-center gap-3">
                    <img alt="Logo da empresa" className="h-16 w-16 rounded-2xl border border-slate-200 object-cover" src={settings.logoData} />
                    <button className="text-sm font-semibold text-rose-600" onClick={() => updateField('logoData', '')} type="button">
                      Remover logo
                    </button>
                  </div>
                )}
              </div>
              <Input id="settings-cep" label="CEP" onBlur={() => void lookupCep()} onChange={(event) => updateField('cep', event.target.value)} placeholder="00000-000" value={settings.cep} />
              {isSearchingCep && <p className="text-xs font-semibold text-indigo-600">Buscando endereco pelo ViaCEP...</p>}
              <Input id="settings-address" label="Endereco" onChange={(event) => updateField('address', event.target.value)} value={settings.address} />
              <Input id="settings-complement" label="Complemento" onChange={(event) => updateField('addressComplement', event.target.value)} value={settings.addressComplement} />
              <Input id="settings-neighborhood" label="Bairro" onChange={(event) => updateField('neighborhood', event.target.value)} value={settings.neighborhood} />
              <Input id="settings-city" label="Cidade" onChange={(event) => updateField('city', event.target.value)} value={settings.city} />
              <Input id="settings-state" label="Estado" onChange={(event) => updateField('state', event.target.value)} value={settings.state} />
              <Input id="settings-phone" label="Telefone" onChange={(event) => updateField('phone', event.target.value)} value={settings.phone} />
              <Input id="settings-whatsapp" label="WhatsApp" onChange={(event) => updateField('whatsapp', event.target.value)} value={settings.whatsapp} />
              <Input id="settings-website" label="Site" onChange={(event) => updateField('website', event.target.value)} placeholder="https://www.seusite.com.br" value={settings.website} />
              <TextArea id="settings-opening-hours" label="Horario de funcionamento" onChange={(value) => updateField('openingHours', value)} value={settings.openingHours} />
              <TextArea id="settings-business-description" label="Descricao da empresa" onChange={(value) => updateField('businessDescription', value)} value={settings.businessDescription} />
            </Grid>
          </Panel>
          <Panel title="Socios da Empresa">
            <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSavePartner}>
              <Input id="partner-name" label="Nome do socio" onChange={(event) => updatePartner('name', event.target.value)} value={partnerDraft.name} />
              <Input id="partner-cpf" label="CPF" onChange={(event) => updatePartner('cpf', event.target.value)} value={partnerDraft.cpf} />
              <Input id="partner-rg" label="RG" onChange={(event) => updatePartner('rg', event.target.value)} value={partnerDraft.rg} />
              <Input id="partner-cnh" label="CNH" onChange={(event) => updatePartner('cnh', event.target.value)} value={partnerDraft.cnh} />
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700" htmlFor="partner-proof">
                  Comprovante de residencia
                </label>
                <input
                  className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                  id="partner-proof"
                  onChange={(event) => void handlePartnerProofUpload(event)}
                  type="file"
                />
                {partnerDraft.residenceProofName && (
                  <p className="text-xs text-slate-500">Arquivo: {partnerDraft.residenceProofName}</p>
                )}
              </div>
              <TextArea id="partner-notes" label="Observacoes" onChange={(value) => updatePartner('notes', value)} value={partnerDraft.notes} />
              <div className="flex gap-3 md:col-span-2">
                <Button type="submit">{partnerDraft.id ? 'Atualizar socio' : 'Adicionar socio'}</Button>
                {partnerDraft.id && (
                  <Button onClick={() => setPartnerDraft({ id: '', ...blankPartner })} type="button" variant="secondary">
                    Cancelar edicao
                  </Button>
                )}
              </div>
            </form>
            <div className="mt-7 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="pb-4">Socio</th>
                    <th className="pb-4">CPF</th>
                    <th className="pb-4">RG</th>
                    <th className="pb-4">CNH</th>
                    <th className="pb-4">Comprovante</th>
                    <th className="pb-4">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((partner) => (
                    <tr className="border-t border-slate-100" key={partner.id}>
                      <td className="py-4 font-semibold text-slate-900">{partner.name}</td>
                      <td className="py-4 text-slate-500">{partner.cpf || '-'}</td>
                      <td className="py-4 text-slate-500">{partner.rg || '-'}</td>
                      <td className="py-4 text-slate-500">{partner.cnh || '-'}</td>
                      <td className="py-4 text-slate-500">{partner.residenceProofName || '-'}</td>
                      <td className="py-4">
                        <div className="flex gap-3 font-semibold">
                          <button className="text-indigo-600" onClick={() => setPartnerDraft({ ...partner })} type="button">
                            Editar
                          </button>
                          <button className="text-rose-600" onClick={() => void removePartner(partner.id)} type="button">
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {partners.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nenhum socio cadastrado.</p>}
            </div>
          </Panel>
          <Panel title="Documentos da Empresa">
            <Grid>
              <Input id="company-cnpj" label="CNPJ" onChange={(event) => updateField('cnpj', event.target.value)} value={settings.cnpj} />
              <Input id="municipal" label="Inscricao Municipal" onChange={(event) => updateField('municipalRegistration', event.target.value)} placeholder="000.000.000.000" value={settings.municipalRegistration} />
              <Input id="state-registration" label="Inscricao Estadual" onChange={(event) => updateField('stateRegistration', event.target.value)} placeholder="000.000.000.000" value={settings.stateRegistration} />
            </Grid>
            <div className="mt-5 space-y-5">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <h4 className="text-base font-semibold text-slate-900">Cartao CNPJ / Cadastro Nacional da Pessoa Juridica</h4>
                <p className="mt-2 text-sm text-slate-500">
                  Anexe o documento oficial. Texto simples pode ser lido no navegador; PDF/imagem fica salvo
                  para leitura por backend OCR/IA.
                </p>
                <input
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                  className="mt-4 block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                  onChange={(event) => void handleCnpjDocumentUpload(event)}
                  type="file"
                />
                {settings.cnpjDocumentName && (
                  <p className="mt-3 text-sm text-slate-600">Documento anexado: {settings.cnpjDocumentName}</p>
                )}
              </div>
              <TextArea id="articles" label="Contrato Social" onChange={(value) => updateField('articlesOfAssociation', value)} value={settings.articlesOfAssociation} />
              <TextArea id="commercial-proof" label="Comprovante de Endereco Comercial" onChange={(value) => updateField('commercialAddressProof', value)} value={settings.commercialAddressProof} />
            </div>
          </Panel>
          <Button onClick={() => void saveSettings()} type="button">Salvar Configuracoes da Empresa</Button>
        </div>
      )}

      {activeTab === 'funcionarios' && (
        <div className="mt-4 grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
          <form onSubmit={handleAddEmployee}><Panel title="Novo Funcionario"><div className="space-y-4"><Input id="employee-name" label="Nome" onChange={(event) => setEmployeeDraft((draft) => ({ ...draft, name: event.target.value }))} value={employeeDraft.name} /><Input id="employee-role" label="Funcao" onChange={(event) => setEmployeeDraft((draft) => ({ ...draft, role: event.target.value }))} value={employeeDraft.role} /><Input id="employee-email" label="E-mail" onChange={(event) => setEmployeeDraft((draft) => ({ ...draft, email: event.target.value }))} value={employeeDraft.email} /><Button className="w-full" type="submit">Adicionar</Button></div></Panel></form>
          <Panel title="Funcionarios"><div className="space-y-3">{employees.map((employee) => <div className="rounded-xl border border-slate-100 p-4" key={employee.id}><p className="font-semibold">{employee.name}</p><p className="text-sm text-slate-500">{employee.role} - {employee.email}</p></div>)}{employees.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nenhum funcionario cadastrado.</p>}</div></Panel>
        </div>
      )}

      {activeTab === 'pagamento' && (
        <Panel className="mt-4" title="Configuracoes de Pagamento">
          <p className="text-sm text-slate-500">Nenhuma assinatura ou cobranca cadastrada para exibicao.</p>
        </Panel>
      )}

      {activeTab === 'google' && <GoogleBusinessProfilePanel organizationId={organizationId} />}

      {activeTab === 'pagina-inicial' && isAdmin && (
        <form className="mt-4" onSubmit={handleSaveHome}>
          <Panel title="Conteudo da Pagina Inicial">
            <Grid>
              <Input id="home-title" label="Titulo do slide principal" onChange={(event) => setHomeSettings((item) => ({ ...item, heroTitle: event.target.value }))} value={homeSettings.heroTitle} />
              <Input id="home-email" label="E-mail do footer" onChange={(event) => setHomeSettings((item) => ({ ...item, footerEmail: event.target.value }))} value={homeSettings.footerEmail} />
              <TextArea id="home-description" label="Descricao do slide" onChange={(value) => setHomeSettings((item) => ({ ...item, heroDescription: value }))} value={homeSettings.heroDescription} />
              <TextArea id="footer-description" label="Descricao do footer" onChange={(value) => setHomeSettings((item) => ({ ...item, footerDescription: value }))} value={homeSettings.footerDescription} />
              <Input id="footer-phone" label="Telefone do footer" onChange={(event) => setHomeSettings((item) => ({ ...item, footerPhone: event.target.value }))} value={homeSettings.footerPhone} />
              <Input id="footer-address" label="Endereco do footer" onChange={(event) => setHomeSettings((item) => ({ ...item, footerAddress: event.target.value }))} value={homeSettings.footerAddress} />
            </Grid>
            <Button className="mt-6" type="submit">Salvar Pagina Inicial</Button>
          </Panel>
        </form>
      )}
    </DashboardLayout>
  )
}

function Panel({ children, className = '', title }: { children: React.ReactNode; className?: string; title: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}><h3 className="mb-6 text-xl font-semibold text-slate-900">{title}</h3>{children}</section>
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5 md:grid-cols-2">{children}</div>
}

function TextArea({ id, label, onChange, value }: { id: string; label: string; onChange: (value: string) => void; value: string }) {
  return <div className="space-y-2"><label className="block text-sm font-medium text-slate-700" htmlFor={id}>{label}</label><textarea className="min-h-24 w-full rounded-xl border border-slate-200 bg-white p-4 text-sm outline-none focus:border-indigo-500" id={id} onChange={(event) => onChange(event.target.value)} value={value} /></div>
}
