import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../hooks/useAuth'
import {
  loadAccountProfile,
  saveAccountProfile,
  type AccountProfile,
} from '../../services/accountProfileService'
import { listPlatformAppPricing } from '../../services/adminAppsService'
import { formatMonthlyPrice, getApplication, purchasableApplications } from '../../services/appCatalog'
import { paymentService } from '../../services/paymentService'
import { lookupCompanyAddress } from '../../services/postalCodeService'
import type { PaymentMethod } from '../../types/payments'
import { formatCnpj, formatPhone, formatPostalCode, isValidEmail } from '../../utils/formatters'

interface CardForm {
  holder: string
  number: string
  expiration: string
  cvv: string
}

type CardErrors = Partial<Record<keyof CardForm, string>>
type SettingsSection = 'pagamentos' | 'conta' | 'assinaturas'

const emptyCard: CardForm = {
  holder: '',
  number: '',
  expiration: '',
  cvv: '',
}

export function Payments() {
  const [params] = useSearchParams()
  const requestedApplication = getApplication(params.get('app') ?? '')
  const initialApplication =
    requestedApplication?.status === 'requires-purchase'
      ? requestedApplication
      : purchasableApplications[0]
  const [applicationId, setApplicationId] = useState(initialApplication.id)
  const [method, setMethod] = useState<PaymentMethod>('credit-card')
  const [card, setCard] = useState<CardForm>(emptyCard)
  const [errors, setErrors] = useState<CardErrors>({})
  const [completedPurchase, setCompletedPurchase] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [section, setSection] = useState<SettingsSection>('pagamentos')
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null)
  const [accountFeedback, setAccountFeedback] = useState('')
  const [accountError, setAccountError] = useState('')
  const [isLoadingAccount, setIsLoadingAccount] = useState(true)
  const [isSavingAccount, setIsSavingAccount] = useState(false)
  const [pricing, setPricing] = useState<Record<string, { active: boolean; monthlyPrice: number }>>({})
  const [activeApplicationIds, setActiveApplicationIds] = useState<string[]>([])
  const { user } = useAuth()
  const pricedPurchasableApplications = purchasableApplications
    .map((product) => {
      const appPricing = pricing[product.id]
      return appPricing
        ? {
            ...product,
            price: formatMonthlyPrice(appPricing.monthlyPrice),
            status: appPricing.active ? product.status : 'coming-soon',
          }
        : product
    })
    .filter((product) => product.status === 'requires-purchase')
  const application =
    pricedPurchasableApplications.find((product) => product.id === applicationId) ??
    getApplication(applicationId) ??
    pricedPurchasableApplications[0] ??
    initialApplication
  const isActive = user
    ? activeApplicationIds.includes(application.id)
    : false

  function updateCard(field: keyof CardForm, value: string) {
    setCard((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '' }))
  }

  useEffect(() => {
    let active = true

    Promise.all([
      loadAccountProfile(),
      listPlatformAppPricing().catch(() => []),
      user ? paymentService.getActiveApplicationIdsFromSupabase(user.id).catch(() => paymentService.getActiveApplicationIds(user.id)) : Promise.resolve([]),
    ])
      .then(([profile, pricingItems, accessIds]) => {
        if (!active) return
        setAccountProfile(profile)
        setActiveApplicationIds(accessIds)
        setPricing(
          Object.fromEntries(
            pricingItems.map((item) => [item.applicationId, { active: item.active, monthlyPrice: item.monthlyPrice }]),
          ),
        )
      })
      .catch((loadError) => {
        if (active) {
          setAccountError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar sua conta.')
        }
      })
      .finally(() => {
        if (active) setIsLoadingAccount(false)
      })

    return () => {
      active = false
    }
  }, [user])

  function updateAccount(field: keyof AccountProfile, value: string) {
    const nextValue =
      field === 'cep'
        ? formatPostalCode('BR', value)
        : field === 'phone'
        ? formatPhone('BR', value)
        : field === 'cnpj'
        ? formatCnpj(value)
        : value

    setAccountProfile((current) => (current ? { ...current, [field]: nextValue } : current))
    setAccountError('')
  }

  async function handleAccountCepLookup() {
    if (!accountProfile?.cep) return
    if (accountProfile.cep.replace(/\D/g, '').length !== 8) return

    try {
      const result = await lookupCompanyAddress('BR', accountProfile.cep)
      setAccountProfile((current) =>
        current
          ? {
              ...current,
              cep: result.fields.cep ?? current.cep,
              address: result.fields.endereco ?? current.address,
              addressComplement: result.fields.complemento ?? current.addressComplement,
              neighborhood: result.fields.bairro ?? current.neighborhood,
              city: result.fields.cidade ?? current.city,
              state: result.fields.estado ?? current.state,
            }
          : current,
      )
      setAccountFeedback(result.message)
      setAccountError('')
    } catch (lookupError) {
      setAccountError(lookupError instanceof Error ? lookupError.message : 'Nao foi possivel consultar o CEP.')
    }
  }

  async function handleSaveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accountProfile) return

    if (accountProfile.email && !isValidEmail(accountProfile.email)) {
      setAccountError('Informe um e-mail valido.')
      return
    }

    if (!accountProfile.name.trim()) {
      setAccountError('Informe o nome do escritorio/empresa.')
      return
    }

    if (accountProfile.cnpj && accountProfile.cnpj.replace(/\D/g, '').length !== 14) {
      setAccountError('Informe um CNPJ valido com 14 numeros.')
      return
    }

    setIsSavingAccount(true)
    try {
      await saveAccountProfile(accountProfile)
      const refreshedProfile = await loadAccountProfile()
      setAccountProfile(refreshedProfile)
      setAccountFeedback('Minha conta salva com sucesso.')
      setAccountError('')
    } catch (saveError) {
      setAccountError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar sua conta.')
      setAccountFeedback('')
    } finally {
      setIsSavingAccount(false)
    }
  }

  async function handlePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!user) {
      return
    }

    if (method === 'credit-card') {
      const nextErrors: CardErrors = {
        holder: card.holder.trim() ? '' : 'Informe o nome impresso no cartão.',
        number: card.number.trim() ? '' : 'Informe o número do cartão.',
        expiration: card.expiration.trim() ? '' : 'Informe a validade.',
        cvv: card.cvv.trim() ? '' : 'Informe o CVV.',
      }

      if (Object.values(nextErrors).some(Boolean)) {
        setErrors(nextErrors)
        return
      }
    }

    setIsSubmitting(true)
    await paymentService.purchase(application.id, method, user)
    setActiveApplicationIds(await paymentService.getActiveApplicationIdsFromSupabase(user.id))
    setCompletedPurchase(application.id)
    setIsSubmitting(false)
  }

  const justUnlocked = completedPurchase === application.id

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link className="flex items-center gap-3 text-lg font-semibold text-slate-900" to="/aplicativos">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl text-white">
              A
            </span>
            Aurora Personal
          </Link>
          <Link className="text-sm font-semibold text-indigo-600 hover:text-indigo-700" to="/aplicativos">
            Voltar aos aplicativos
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-7 px-5 py-9 sm:px-8 lg:grid-cols-[250px_1fr]">
        <aside className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            Configurações
          </p>
          {([
            ['pagamentos', 'Pagamentos'],
            ['conta', 'Minha conta'],
            ['assinaturas', 'Assinaturas'],
          ] as Array<[SettingsSection, string]>).map(([item, label]) => (
            <button
              aria-pressed={section === item}
              className={`mt-1 flex w-full rounded-xl px-4 py-3 text-left text-sm transition ${
                section === item
                  ? 'bg-indigo-50 font-semibold text-indigo-700'
                  : 'font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-950'
              }`}
              key={item}
              onClick={() => setSection(item)}
              type="button"
            >
              {label}
            </button>
          ))}
        </aside>

        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
          {section === 'pagamentos' && (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
                Pagamentos
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
                Liberar aplicativo
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                Escolha o aplicativo premium e conclua a compra simulada para liberar o acesso.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {pricedPurchasableApplications.map((product) => {
              const selected = product.id === application.id
              const active = user
                ? activeApplicationIds.includes(product.id)
                : false

              return (
                <button
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected
                      ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  key={product.id}
                  onClick={() => {
                    setApplicationId(product.id)
                    setCompletedPurchase('')
                  }}
                  type="button"
                >
                  <span className="text-sm font-semibold text-slate-900">{product.name}</span>
                  <span className="mt-2 block text-sm text-slate-500">{product.price}</span>
                  {active && (
                    <span className="mt-3 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      Ativo
                    </span>
                  )}
                </button>
              )
            })}
              </div>

              {(isActive || justUnlocked) && (
            <div className="mt-7 space-y-4">
              <Alert type="success">
                Acesso ativo para <strong>{application.name}</strong>.
              </Alert>
              {application.route && (
                <Link
                  className="inline-flex h-12 items-center rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white transition hover:bg-indigo-700"
                  to={application.route}
                >
                  Abrir aplicativo
                </Link>
              )}
            </div>
              )}

              {!isActive && !justUnlocked && (
            <form className="mt-8" noValidate onSubmit={handlePayment}>
              <div className="mb-6 flex border-b border-slate-200">
                <button
                  className={`border-b-2 px-5 py-4 text-sm font-semibold transition ${
                    method === 'credit-card'
                      ? 'border-indigo-600 text-indigo-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                  onClick={() => setMethod('credit-card')}
                  type="button"
                >
                  Cartão de crédito
                </button>
                <button
                  className={`border-b-2 px-5 py-4 text-sm font-semibold transition ${
                    method === 'pix'
                      ? 'border-indigo-600 text-indigo-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                  onClick={() => setMethod('pix')}
                  type="button"
                >
                  Pix
                </button>
              </div>

              {method === 'credit-card' ? (
                <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Input
                      error={errors.holder}
                      id="card-holder"
                      label="Nome no cartão"
                      onChange={(event) => updateCard('holder', event.target.value)}
                      placeholder="Nome completo"
                      required
                      value={card.holder}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      error={errors.number}
                      id="card-number"
                      label="Número do cartão"
                      onChange={(event) => updateCard('number', event.target.value)}
                      placeholder="0000 0000 0000 0000"
                      required
                      value={card.number}
                    />
                  </div>
                  <Input
                    error={errors.expiration}
                    id="card-expiration"
                    label="Validade"
                    onChange={(event) => updateCard('expiration', event.target.value)}
                    placeholder="MM/AA"
                    required
                    value={card.expiration}
                  />
                  <Input
                    error={errors.cvv}
                    id="card-cvv"
                    label="CVV"
                    onChange={(event) => updateCard('cvv', event.target.value)}
                    placeholder="123"
                    required
                    value={card.cvv}
                  />
                </div>
              ) : (
                <div className="max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-slate-900">Pagamento via Pix</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Ao confirmar, um pagamento Pix simulado libera imediatamente o aplicativo.
                  </p>
                  <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-4 font-mono text-xs text-slate-500">
                    00020126...AURORA.PAGAMENTO.PIX...6304ABCD
                  </div>
                </div>
              )}

              <Button className="mt-7 px-7" isLoading={isSubmitting} type="submit">
                {method === 'credit-card' ? 'Finalizar compra' : 'Confirmar pagamento Pix'}
              </Button>
              <p className="mt-4 text-xs text-slate-400">
                Ambiente demonstrativo: nenhum pagamento real será processado.
              </p>
            </form>
              )}
            </>
          )}

          {section === 'conta' && (
            <form className="max-w-5xl" onSubmit={handleSaveAccount}>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
                Minha conta
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
                Dados do escritorio
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                Edite as informacoes do escritorio de contabilidade. Se ainda nao existir cadastro,
                o sistema cria o registro ao salvar.
              </p>
              {accountFeedback && <div className="mt-6"><Alert type="success">{accountFeedback}</Alert></div>}
              {accountError && <div className="mt-6"><Alert type="error">{accountError}</Alert></div>}
              {isLoadingAccount && (
                <div className="mt-8 rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm text-slate-500">
                  Carregando dados da conta...
                </div>
              )}

              {!isLoadingAccount && accountProfile && (
                <>
                  <section className="mt-8 rounded-2xl border border-slate-100 bg-slate-50 p-5">
                    <h2 className="text-lg font-semibold text-slate-900">Dados principais</h2>
                    <div className="mt-5 grid gap-5 md:grid-cols-2">
                      <Input id="account-name" label="Nome / escritorio" onChange={(event) => updateAccount('name', event.target.value)} required value={accountProfile.name} />
                      <Input id="account-cnpj" label="CNPJ" onChange={(event) => updateAccount('cnpj', event.target.value)} placeholder="00.000.000/0000-00" value={accountProfile.cnpj} />
                      <Input id="account-contact" label="Responsavel" onChange={(event) => updateAccount('contactName', event.target.value)} value={accountProfile.contactName} />
                      <Input id="account-email" label="E-mail" onChange={(event) => updateAccount('email', event.target.value)} type="email" value={accountProfile.email} />
                      <Input id="account-phone" label="Telefone" onChange={(event) => updateAccount('phone', event.target.value)} placeholder="(00) 00000-0000" value={accountProfile.phone} />
                    </div>
                  </section>

                  <section className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-5">
                    <h2 className="text-lg font-semibold text-slate-900">Endereco comercial</h2>
                    <p className="mt-1 text-sm text-slate-500">Digite o CEP e saia do campo para preencher pelo ViaCEP.</p>
                    <div className="mt-5 grid gap-5 md:grid-cols-2">
                      <Input id="account-cep" label="CEP" onBlur={() => void handleAccountCepLookup()} onChange={(event) => updateAccount('cep', event.target.value)} placeholder="00000-000" value={accountProfile.cep} />
                      <Input id="account-address" label="Endereco" onChange={(event) => updateAccount('address', event.target.value)} value={accountProfile.address} />
                      <Input id="account-complement" label="Complemento" onChange={(event) => updateAccount('addressComplement', event.target.value)} value={accountProfile.addressComplement} />
                      <Input id="account-neighborhood" label="Bairro" onChange={(event) => updateAccount('neighborhood', event.target.value)} value={accountProfile.neighborhood} />
                      <Input id="account-city" label="Cidade" onChange={(event) => updateAccount('city', event.target.value)} value={accountProfile.city} />
                      <Input id="account-state" label="Estado" onChange={(event) => updateAccount('state', event.target.value.toUpperCase())} value={accountProfile.state} />
                    </div>
                  </section>

                  <section className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                    <h2 className="text-lg font-semibold text-slate-900">Indicacoes</h2>
                    <p className="mt-1 text-sm text-indigo-900">
                      Compartilhe seu codigo com outro contador. Quando ele assinar um app, voce recebe uma isencao de 1 mes no mesmo app.
                    </p>
                    <div className="mt-5 grid gap-5 md:grid-cols-2">
                      <Input
                        id="account-referral-code"
                        label="Meu codigo de indicacao"
                        onChange={(event) => updateAccount('referralCode', event.target.value.toUpperCase())}
                        value={accountProfile.referralCode}
                      />
                      <Input
                        id="account-referred-by"
                        label="Codigo de quem me indicou"
                        onChange={(event) => updateAccount('referredByReferralCode', event.target.value.toUpperCase())}
                        placeholder="Ex: CONTADOR-ABC123"
                        value={accountProfile.referredByReferralCode}
                      />
                    </div>
                  </section>

                  <div className="mt-7 flex flex-wrap gap-3">
                    <Button isLoading={isSavingAccount} type="submit">
                      Salvar minha conta
                    </Button>
                    <Button onClick={() => void loadAccountProfile().then(setAccountProfile)} type="button" variant="secondary">
                      Recarregar dados
                    </Button>
                  </div>
                </>
              )}
            </form>
          )}

          {section === 'assinaturas' && (
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
                Assinaturas
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
                Aplicativos ativos
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                A listagem real de assinaturas sera ligada ao banco de pagamentos quando a
                integracao financeira estiver ativa.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
