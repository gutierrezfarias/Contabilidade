import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import type { SerproContractPlan, SerproSettings, SerproSettingsResponse } from '../../types/serpro'
import { LocalAgentPanel } from './LocalAgentPanel'

export type DirectCredentialForm = {
  certificateId: string
  consumerKey: string
  consumerSecret: string
  consumerSecretReference: string
  contractCnpj: string
  environment: string
  status: string
}

type Props = {
  credential: DirectCredentialForm
  data: SerproSettingsResponse
  isPairing: boolean
  isSaving: boolean
  pairingKey: string
  plan: SerproContractPlan | null
  settings: SerproSettings
  onCredentialChange: (credential: DirectCredentialForm) => void
  onRenewPairingKey: () => void
  onSaveCredential: () => void
  onSaveSettings: () => void
  onSettingsChange: (settings: SerproSettings) => void
  onTest: () => void
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' }).format(value || 0)
}

export function CredentialsPanel(props: Props) {
  const { credential, data, isPairing, isSaving, pairingKey, plan, settings } = props
  if (settings.planCode === 'cont_hub_local_agent') {
    return (
      <div className="space-y-6">
        <LocalAgentPanel agent={data.localAgent} installerUrl={plan?.installerUrl ?? ''} isLoading={isPairing} pairingKey={pairingKey} onRenewKey={props.onRenewPairingKey} />
        <CommonSettings {...props} showFallback={false} />
      </div>
    )
  }

  if (settings.planCode === 'serpro_direct') {
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">Contrato do contador</p>
          <h3 className="mt-2 text-xl font-bold text-slate-950">Credencial direta SERPRO</h3>
          <p className="mt-1 text-sm text-slate-500">O segredo e referenciado com seguranca e nunca volta para a tela depois de salvo.</p>
          {data.directCredential.consumerKeyConfigured && (
            <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
              Configuracao atual: Consumer Key {data.directCredential.consumerKeyMasked || 'configurada'} e Consumer Secret protegido.
            </div>
          )}
          <div className="mt-5 grid gap-4">
            <Input label="CNPJ do contrato" value={credential.contractCnpj} onChange={(event) => props.onCredentialChange({ ...credential, contractCnpj: event.target.value })} />
            <Input label="Consumer Key" value={credential.consumerKey} onChange={(event) => props.onCredentialChange({ ...credential, consumerKey: event.target.value })} />
            <Input label="Consumer Secret" type="password" value={credential.consumerSecret} onChange={(event) => props.onCredentialChange({ ...credential, consumerSecret: event.target.value })} />
            <Input label="Referencia do segredo" value={credential.consumerSecretReference} onChange={(event) => props.onCredentialChange({ ...credential, consumerSecretReference: event.target.value })} />
          </div>
          <div className="mt-5 flex flex-wrap gap-3"><Button isLoading={isSaving} onClick={props.onSaveCredential}>Salvar credencial direta</Button><Button variant="secondary" onClick={props.onTest}>Testar credenciais</Button></div>
        </section>
        <CommonSettings {...props} showFallback />
      </div>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-600">Contrato CONT HUB</p>
        <h3 className="mt-2 text-xl font-bold text-slate-950">Acesso gerenciado</h3>
        <div className="mt-5 space-y-3 text-sm">
          <Info label="Status do contrato" value={data.managedCredential.status} />
          <Info label="Carteira disponivel" value={money(data.wallet.balance)} />
          <Info label="Valor reservado" value={money(data.wallet.reservedBalance)} />
          <Info label="Servicos liberados" value={String(data.organizationServices.filter((item) => Boolean(item.enabled)).length)} />
        </div>
        <Button className="mt-5" variant="secondary" onClick={props.onTest}>Testar configuracao CONT HUB</Button>
      </section>
      <CommonSettings {...props} showFallback={false} />
    </div>
  )
}

function CommonSettings(props: Props & { showFallback: boolean }) {
  const { settings } = props
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h3 className="text-xl font-bold text-slate-950">Preferencias de acesso</h3>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-slate-700">Ambiente<select className="h-12 w-full rounded-xl border border-slate-200 px-4" value={settings.environment} onChange={(event) => props.onSettingsChange({ ...settings, environment: event.target.value as SerproSettings['environment'] })}><option disabled={!props.plan?.allowsHomologation} value="homologacao">Homologacao</option><option disabled={!props.plan?.allowsProduction} value="producao">Producao</option></select></label>
        <label className="space-y-2 text-sm font-medium text-slate-700">Status<select className="h-12 w-full rounded-xl border border-slate-200 px-4" value={settings.status} onChange={(event) => props.onSettingsChange({ ...settings, status: event.target.value as SerproSettings['status'] })}><option value="draft">Rascunho</option><option value="active">Ativo</option><option value="paused">Pausado</option></select></label>
        <Input label="E-mail de notificacao" value={settings.notificationEmail} onChange={(event) => props.onSettingsChange({ ...settings, notificationEmail: event.target.value })} />
        <Input label="Limite diario de requisicoes" type="number" value={settings.dailyRequestLimit} onChange={(event) => props.onSettingsChange({ ...settings, dailyRequestLimit: Number(event.target.value) })} />
      </div>
      {props.showFallback && <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-slate-700"><input checked={settings.allowManagedFallback} disabled={!props.plan?.allowsFallback} type="checkbox" onChange={(event) => props.onSettingsChange({ ...settings, allowManagedFallback: event.target.checked })} />Permitir fallback para contrato CONT HUB</label>}
      <Button className="mt-5" isLoading={props.isSaving} onClick={props.onSaveSettings}>Salvar preferencias</Button>
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4"><span className="text-slate-500">{label}</span><strong className="text-slate-900">{value}</strong></div>
}
