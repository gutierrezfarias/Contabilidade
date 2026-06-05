import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../hooks/useAuth'
import { resolveOrganizationId } from '../../services/platformService'
import {
  listWebsiteTemplates,
  loadWebsiteSite,
  saveWebsiteSite,
  type WebsiteSiteInput,
} from '../../services/websiteBuilderService'
import type { WebsiteTemplate } from '../../types/website'

const blankSite: WebsiteSiteInput = {
  templateId: '',
  siteName: '',
  domain: '',
  headline: 'Contabilidade moderna para o seu negocio',
  subtitle: 'Organize impostos, documentos e obrigacoes com apoio consultivo.',
  aboutText: 'Somos um escritorio de contabilidade focado em clareza, atendimento proximo e decisao segura.',
  servicesText: 'Abertura de empresa, folha de pagamento, fiscal, contabilidade mensal e consultoria.',
  primaryColor: '#4f46e5',
  logoData: '',
  heroImageData: '',
  published: false,
}

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'))
    reader.readAsDataURL(file)
  })
}

export function WebsiteBuilder() {
  const navigate = useNavigate()
  const { logout, user } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<WebsiteTemplate[]>([])
  const [form, setForm] = useState<WebsiteSiteInput>(blankSite)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.templateId),
    [form.templateId, templates],
  )

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [id, loadedTemplates] = await Promise.all([resolveOrganizationId(), listWebsiteTemplates()])
        if (!active) return
        setOrganizationId(id)
        setTemplates(loadedTemplates)
        const site = await loadWebsiteSite(id)
        if (!active) return
        setForm(site ?? { ...blankSite, templateId: loadedTemplates[0]?.id ?? '' })
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar criador de site.')
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  function updateField(field: keyof WebsiteSiteInput, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }))
    setError('')
  }

  async function handleImageUpload(field: 'logoData' | 'heroImageData', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Selecione uma imagem valida.')
      event.target.value = ''
      return
    }
    if (file.size > 1_500_000) {
      setError('Use imagem com ate 1.5 MB para salvar direto no banco.')
      event.target.value = ''
      return
    }

    try {
      updateField(field, await readImage(file))
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Erro ao carregar imagem.')
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!organizationId) {
      setError('Nenhum escritorio vinculado ao usuario.')
      return
    }
    if (!form.siteName.trim()) {
      setError('Informe o nome do site/escritorio.')
      return
    }

    try {
      await saveWebsiteSite(organizationId, form)
      setFeedback('Site salvo com sucesso.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar o site.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link className="flex items-center gap-3 text-lg font-semibold text-slate-900" to="/aplicativos">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl text-white">A</span>
            Crie seu site
          </Link>
          <div className="flex items-center gap-4">
            <Link className="hidden text-sm font-semibold text-indigo-600 md:block" to="/aplicativos">Aplicativos</Link>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <Button onClick={handleLogout} variant="secondary">Sair</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-7 px-5 py-9 sm:px-8 xl:grid-cols-[0.9fr_1.1fr]">
        <section>
          <div className="mb-7">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600">Website</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Gerenciar meu site</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Escolha um modelo liberado pelo Admin, personalize textos, imagens e informe o dominio.
            </p>
          </div>
          {feedback && <div className="mb-5"><Alert type="success">{feedback}</Alert></div>}
          {error && <div className="mb-5"><Alert type="error">{error}</Alert></div>}

          <form className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm" onSubmit={handleSave}>
            <div className="grid gap-4 md:grid-cols-2">
              <Select id="template" label="Modelo do site" onChange={(value) => updateField('templateId', value)} value={form.templateId}>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </Select>
              <Input id="domain" label="Dominio" onChange={(event) => updateField('domain', event.target.value)} placeholder="www.seuescritorio.com.br" value={form.domain} />
              <Input id="site-name" label="Nome do site" onChange={(event) => updateField('siteName', event.target.value)} value={form.siteName} />
              <Input id="primary-color" label="Cor principal" onChange={(event) => updateField('primaryColor', event.target.value)} type="color" value={form.primaryColor} />
              <Input id="headline" label="Titulo principal" onChange={(event) => updateField('headline', event.target.value)} value={form.headline} />
              <Input id="subtitle" label="Subtitulo" onChange={(event) => updateField('subtitle', event.target.value)} value={form.subtitle} />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Textarea label="Sobre o escritorio" onChange={(value) => updateField('aboutText', value)} value={form.aboutText} />
              <Textarea label="Servicos" onChange={(value) => updateField('servicesText', value)} value={form.servicesText} />
            </div>

            <div className="mt-5 grid gap-4 rounded-2xl bg-slate-50 p-4 md:grid-cols-2">
              <ImageUpload label="Logo" onChange={(event) => void handleImageUpload('logoData', event)} preview={form.logoData} />
              <ImageUpload label="Imagem principal" onChange={(event) => void handleImageUpload('heroImageData', event)} preview={form.heroImageData} />
            </div>

            <label className="mt-5 flex items-center gap-3 text-sm font-semibold text-slate-700">
              <input checked={form.published} onChange={(event) => updateField('published', event.target.checked)} type="checkbox" />
              Site publicado
            </label>

            <Button className="mt-6" type="submit">Salvar site</Button>
          </form>
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Preview</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">{selectedTemplate?.name ?? 'Modelo'}</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${form.published ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {form.published ? 'Publicado' : 'Rascunho'}
            </span>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-100">
            <div className="p-6 text-white" style={{ background: form.primaryColor }}>
              <div className="flex items-center gap-3">
                {form.logoData && <img alt="Logo" className="h-12 w-12 rounded-2xl bg-white object-cover" src={form.logoData} />}
                <p className="font-bold">{form.siteName || 'Seu escritorio'}</p>
              </div>
              <div className="mt-10 grid gap-6 md:grid-cols-[1fr_220px] md:items-center">
                <div>
                  <h3 className="text-3xl font-bold leading-tight">{form.headline}</h3>
                  <p className="mt-4 text-sm leading-6 text-white/80">{form.subtitle}</p>
                </div>
                {form.heroImageData ? (
                  <img alt="Imagem principal" className="h-44 w-full rounded-3xl object-cover" src={form.heroImageData} />
                ) : (
                  <div className="h-44 rounded-3xl bg-white/10" />
                )}
              </div>
            </div>
            <div className="grid gap-5 p-6 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="font-bold text-slate-900">Sobre</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{form.aboutText}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="font-bold text-slate-900">Servicos</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{form.servicesText}</p>
              </div>
            </div>
          </div>

          <p className="mt-5 rounded-2xl bg-indigo-50 p-4 text-sm leading-6 text-indigo-900">
            O dominio sera apontado no provedor de DNS. Esta tela guarda o dominio desejado e o conteudo do site.
          </p>
        </section>
      </main>
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
    <label className="block space-y-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <select className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm" id={id} onChange={(event) => onChange(event.target.value)} value={value}>
        {children}
      </select>
    </label>
  )
}

function Textarea({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block space-y-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <textarea className="min-h-32 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  )
}

function ImageUpload({
  label,
  onChange,
  preview,
}: {
  label: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  preview: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <input accept="image/*" className="mt-2 block w-full text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" onChange={onChange} type="file" />
      {preview && <img alt={label} className="mt-3 h-20 w-20 rounded-2xl object-cover" src={preview} />}
    </div>
  )
}
