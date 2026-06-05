import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AdminLayout } from '../../components/layout/AdminLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import {
  deleteAdminWebsiteTemplate,
  listAdminWebsiteTemplates,
  listPlatformAppPricing,
  saveAdminWebsiteTemplate,
  savePlatformAppPricing,
  type AdminWebsiteTemplate,
  type PlatformAppPricing,
} from '../../services/adminAppsService'

type AdminAppsTab = 'precos' | 'modelos'

const blankTemplate: AdminWebsiteTemplate = {
  name: '',
  description: '',
  previewImage: '',
  layoutKey: '',
  active: true,
  sortOrder: 0,
}

const currency = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' })

export function AdminApps() {
  const [tab, setTab] = useState<AdminAppsTab>('precos')
  const [apps, setApps] = useState<PlatformAppPricing[]>([])
  const [templates, setTemplates] = useState<AdminWebsiteTemplate[]>([])
  const [templateForm, setTemplateForm] = useState<AdminWebsiteTemplate>(blankTemplate)
  const [editingTemplateId, setEditingTemplateId] = useState<string | undefined>()
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  async function reload() {
    const [loadedApps, loadedTemplates] = await Promise.all([
      listPlatformAppPricing(),
      listAdminWebsiteTemplates(),
    ])
    setApps(loadedApps)
    setTemplates(loadedTemplates)
  }

  useEffect(() => {
    let active = true

    Promise.all([listPlatformAppPricing(), listAdminWebsiteTemplates()])
      .then(([loadedApps, loadedTemplates]) => {
        if (!active) return
        setApps(loadedApps)
        setTemplates(loadedTemplates)
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar aplicativos.')
      })

    return () => {
      active = false
    }
  }, [])

  function updateApp(applicationId: string, field: keyof PlatformAppPricing, value: string | number | boolean) {
    setApps((current) =>
      current.map((app) => (app.applicationId === applicationId ? { ...app, [field]: value } : app)),
    )
  }

  async function saveApp(app: PlatformAppPricing) {
    try {
      await savePlatformAppPricing(app)
      await reload()
      setFeedback(`Preco de ${app.name} salvo.`)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar o aplicativo.')
      setFeedback('')
    }
  }

  function editTemplate(template: AdminWebsiteTemplate) {
    setEditingTemplateId(template.id)
    setTemplateForm(template)
    setTab('modelos')
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!templateForm.name || !templateForm.layoutKey) {
      setError('Informe nome e chave do layout.')
      return
    }

    try {
      await saveAdminWebsiteTemplate({ ...templateForm, id: editingTemplateId })
      await reload()
      setTemplateForm(blankTemplate)
      setEditingTemplateId(undefined)
      setFeedback('Modelo de site salvo.')
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar o modelo.')
      setFeedback('')
    }
  }

  async function removeTemplate(templateId?: string) {
    if (!templateId || !window.confirm('Excluir este modelo de site?')) return

    try {
      await deleteAdminWebsiteTemplate(templateId)
      await reload()
      setFeedback('Modelo excluido.')
      setError('')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Nao foi possivel excluir.')
      setFeedback('')
    }
  }

  return (
    <AdminLayout title="Aplicativos">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600">Admin</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Gestao de aplicativos</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Defina precos, descontos, status dos apps e modelos que os contadores poderao escolher no app Crie seu site.
        </p>
      </div>

      {feedback && <div className="mb-5"><Alert type="success">{feedback}</Alert></div>}
      {error && <div className="mb-5"><Alert type="error">{error}</Alert></div>}

      <div className="mb-7 grid gap-3 rounded-2xl bg-white p-2 shadow-sm sm:grid-cols-2">
        <button className={`rounded-xl p-4 text-left text-sm font-semibold ${tab === 'precos' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setTab('precos')} type="button">
          Precos e pacotes
        </button>
        <button className={`rounded-xl p-4 text-left text-sm font-semibold ${tab === 'modelos' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setTab('modelos')} type="button">
          Modelos de site
        </button>
      </div>

      {tab === 'precos' && (
        <section className="grid gap-4">
          {apps.map((app) => (
            <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm" key={app.applicationId}>
              <div className="grid gap-4 lg:grid-cols-[1fr_140px_140px_120px_auto] lg:items-end">
                <Input id={`name-${app.applicationId}`} label="Aplicativo" onChange={(event) => updateApp(app.applicationId, 'name', event.target.value)} value={app.name} />
                <Input id={`price-${app.applicationId}`} label="Valor mensal" min="0" onChange={(event) => updateApp(app.applicationId, 'monthlyPrice', Number(event.target.value || 0))} type="number" value={app.monthlyPrice} />
                <Input id={`discount-${app.applicationId}`} label="Desconto %" min="0" onChange={(event) => updateApp(app.applicationId, 'discountPercent', Number(event.target.value || 0))} type="number" value={app.discountPercent} />
                <label className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">
                  <input checked={app.active} onChange={(event) => updateApp(app.applicationId, 'active', event.target.checked)} type="checkbox" />
                  Ativo
                </label>
                <Button onClick={() => void saveApp(app)}>Salvar</Button>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                {app.isBundle ? 'Pacote: ' : 'App: '}
                {currency.format(app.monthlyPrice)} {app.discountPercent > 0 ? `com ${app.discountPercent}% de desconto configurado.` : ''}
              </p>
            </article>
          ))}
        </section>
      )}

      {tab === 'modelos' && (
        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <form className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm" onSubmit={saveTemplate}>
            <h3 className="text-xl font-bold text-slate-900">{editingTemplateId ? 'Editar modelo' : 'Novo modelo'}</h3>
            <div className="mt-5 space-y-4">
              <Input id="template-name" label="Nome do modelo" onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} value={templateForm.name} />
              <Input id="template-layout" label="Chave do layout" onChange={(event) => setTemplateForm((current) => ({ ...current, layoutKey: event.target.value }))} placeholder="modern-accounting" value={templateForm.layoutKey} />
              <Input id="template-preview" label="URL/preview da imagem" onChange={(event) => setTemplateForm((current) => ({ ...current, previewImage: event.target.value }))} value={templateForm.previewImage} />
              <Input id="template-order" label="Ordem" onChange={(event) => setTemplateForm((current) => ({ ...current, sortOrder: Number(event.target.value || 0) }))} type="number" value={templateForm.sortOrder} />
              <label className="block space-y-2 text-sm font-medium text-slate-700">
                <span>Descricao</span>
                <textarea className="min-h-24 w-full rounded-xl border border-slate-200 p-4 text-sm" onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))} value={templateForm.description} />
              </label>
              <label className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">
                <input checked={templateForm.active} onChange={(event) => setTemplateForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" />
                Modelo ativo
              </label>
            </div>
            <div className="mt-6 flex gap-3">
              <Button type="submit">{editingTemplateId ? 'Atualizar modelo' : 'Adicionar modelo'}</Button>
              {editingTemplateId && <Button onClick={() => { setEditingTemplateId(undefined); setTemplateForm(blankTemplate) }} variant="secondary">Cancelar</Button>}
            </div>
          </form>

          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="mb-5 text-xl font-bold text-slate-900">Modelos cadastrados</h3>
            <div className="space-y-3">
              {templates.map((template) => (
                <article className="rounded-2xl border border-slate-100 p-4" key={template.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{template.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{template.description}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${template.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {template.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <div className="mt-4 flex gap-4 text-sm font-semibold">
                    <button className="text-indigo-600" onClick={() => editTemplate(template)} type="button">Editar</button>
                    <button className="text-rose-600" onClick={() => void removeTemplate(template.id)} type="button">Excluir</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>
      )}
    </AdminLayout>
  )
}
