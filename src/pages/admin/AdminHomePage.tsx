import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AdminLayout } from '../../components/layout/AdminLayout'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { loadHomeSettings } from '../../services/accountingSettingsService'
import {
  deleteFooterGroup,
  deleteFooterLink,
  deleteHomeBanner,
  deleteHomeSlide,
  listFooterGroups,
  listHomeBanners,
  listHomeSlides,
  saveFooterContact,
  saveFooterGroup,
  saveFooterLink,
  saveHomeBanner,
  saveHomeSlide,
} from '../../services/homeCmsService'
import type {
  FooterGroupRecord,
  FooterLinkRecord,
  HomeBanner,
  HomeSlide,
  SlideTheme,
} from '../../types/home'

type AdminHomeTab = 'slides' | 'banners' | 'footer'

const blankSlide: Omit<HomeSlide, 'id'> = {
  eyebrow: '',
  title: '',
  description: '',
  theme: 'focus',
  buttonLabel: 'Comecar agora',
  buttonUrl: '/cadastro',
  imageUrl: '',
  sortOrder: 0,
  active: true,
}

const blankBanner: Omit<HomeBanner, 'id'> = {
  category: '',
  title: '',
  description: '',
  imageUrl: '',
  sortOrder: 0,
  active: true,
}

export function AdminHomeSettingsPanel() {
  const [tab, setTab] = useState<AdminHomeTab>('slides')
  const [slides, setSlides] = useState<HomeSlide[]>([])
  const [banners, setBanners] = useState<HomeBanner[]>([])
  const [footerGroups, setFooterGroups] = useState<FooterGroupRecord[]>([])
  const [slideForm, setSlideForm] = useState(blankSlide)
  const [bannerForm, setBannerForm] = useState(blankBanner)
  const [groupForm, setGroupForm] = useState({ title: '', sortOrder: 0 })
  const [linkForm, setLinkForm] = useState({
    groupId: '',
    label: '',
    url: '',
    sortOrder: 0,
    active: true,
  })
  const [footerForm, setFooterForm] = useState({
    footerDescription: '',
    footerEmail: '',
    footerPhone: '',
    footerAddress: '',
  })
  const [editingSlideId, setEditingSlideId] = useState<string | undefined>()
  const [editingBannerId, setEditingBannerId] = useState<string | undefined>()
  const [editingGroupId, setEditingGroupId] = useState<string | undefined>()
  const [editingLinkId, setEditingLinkId] = useState<string | undefined>()
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  async function reload() {
    const [nextSlides, nextBanners, nextFooterGroups, homeSettings] = await Promise.all([
      listHomeSlides(true),
      listHomeBanners(true),
      listFooterGroups(),
      loadHomeSettings(),
    ])
    setSlides(nextSlides)
    setBanners(nextBanners)
    setFooterGroups(nextFooterGroups)
    setFooterForm({
      footerDescription: homeSettings.footerDescription,
      footerEmail: homeSettings.footerEmail,
      footerPhone: homeSettings.footerPhone,
      footerAddress: homeSettings.footerAddress,
    })
    if (!linkForm.groupId && nextFooterGroups[0]) {
      setLinkForm((current) => ({ ...current, groupId: nextFooterGroups[0].id }))
    }
  }

  useEffect(() => {
    let active = true

    Promise.all([
      listHomeSlides(true),
      listHomeBanners(true),
      listFooterGroups(),
      loadHomeSettings(),
    ])
      .then(([nextSlides, nextBanners, nextFooterGroups, homeSettings]) => {
        if (!active) return
        setSlides(nextSlides)
        setBanners(nextBanners)
        setFooterGroups(nextFooterGroups)
        setFooterForm({
          footerDescription: homeSettings.footerDescription,
          footerEmail: homeSettings.footerEmail,
          footerPhone: homeSettings.footerPhone,
          footerAddress: homeSettings.footerAddress,
        })
        if (nextFooterGroups[0]) {
          setLinkForm((current) => ({ ...current, groupId: current.groupId || nextFooterGroups[0].id }))
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar pagina inicial.')
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function saveSlide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await saveHomeSlide(slideForm, editingSlideId)
      setSlideForm(blankSlide)
      setEditingSlideId(undefined)
      await reload()
      setFeedback('Slide salvo com sucesso.')
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar slide.')
    }
  }

  async function removeSlide(slideId: string) {
    if (!window.confirm('Excluir este slide?')) return
    try {
      await deleteHomeSlide(slideId)
      await reload()
      setFeedback('Slide excluido.')
      setError('')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Erro ao excluir slide.')
      setFeedback('')
    }
  }

  async function saveBanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await saveHomeBanner(bannerForm, editingBannerId)
      setBannerForm(blankBanner)
      setEditingBannerId(undefined)
      await reload()
      setFeedback('Banner salvo com sucesso.')
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar banner.')
    }
  }

  async function removeBanner(bannerId: string) {
    if (!window.confirm('Excluir este banner?')) return
    try {
      await deleteHomeBanner(bannerId)
      await reload()
      setFeedback('Banner excluido.')
      setError('')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Erro ao excluir banner.')
      setFeedback('')
    }
  }

  async function saveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await saveFooterGroup(groupForm, editingGroupId)
      setGroupForm({ title: '', sortOrder: 0 })
      setEditingGroupId(undefined)
      await reload()
      setFeedback('Grupo do footer salvo.')
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar grupo.')
    }
  }

  async function removeGroup(groupId: string) {
    if (!window.confirm('Excluir este grupo e seus links?')) return
    try {
      await deleteFooterGroup(groupId)
      await reload()
      setFeedback('Grupo excluido.')
      setError('')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Erro ao excluir grupo.')
      setFeedback('')
    }
  }

  async function saveLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await saveFooterLink(linkForm, editingLinkId)
      setLinkForm({ groupId: linkForm.groupId, label: '', url: '', sortOrder: 0, active: true })
      setEditingLinkId(undefined)
      await reload()
      setFeedback('Link do footer salvo.')
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar link.')
    }
  }

  async function removeLink(linkId: string) {
    if (!window.confirm('Excluir este link?')) return
    try {
      await deleteFooterLink(linkId)
      await reload()
      setFeedback('Link excluido.')
      setError('')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Erro ao excluir link.')
      setFeedback('')
    }
  }

  async function saveFooter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await saveFooterContact(footerForm)
      await reload()
      setFeedback('Informacoes do footer salvas.')
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar footer.')
      setFeedback('')
    }
  }

  function editSlide(slide: HomeSlide) {
    setEditingSlideId(slide.id)
    setSlideForm({
      eyebrow: slide.eyebrow,
      title: slide.title,
      description: slide.description,
      theme: slide.theme,
      buttonLabel: slide.buttonLabel ?? '',
      buttonUrl: slide.buttonUrl ?? '',
      imageUrl: slide.imageUrl ?? '',
      sortOrder: slide.sortOrder ?? 0,
      active: slide.active ?? true,
    })
  }

  function editBanner(banner: HomeBanner) {
    setEditingBannerId(banner.id)
    setBannerForm({
      category: banner.category,
      title: banner.title,
      description: banner.description,
      imageUrl: banner.imageUrl ?? '',
      sortOrder: banner.sortOrder ?? 0,
      active: banner.active ?? true,
    })
  }

  function editGroup(group: FooterGroupRecord) {
    setEditingGroupId(group.id)
    setGroupForm({ title: group.title, sortOrder: group.sortOrder })
  }

  function editLink(link: FooterLinkRecord) {
    setEditingLinkId(link.id)
    setLinkForm({
      groupId: link.groupId,
      label: link.label,
      url: link.url,
      sortOrder: link.sortOrder,
      active: link.active,
    })
  }

  return (
    <>
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600">CMS</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
          Configuracao da pagina inicial
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Edite slides, banners e footer. Textos ficam no Supabase; imagens devem ficar no
          Storage e aqui voce informa apenas a URL.
        </p>
      </div>

      {feedback && <div className="mb-6"><Alert type="success">{feedback}</Alert></div>}
      {error && <div className="mb-6"><Alert type="error">{error}</Alert></div>}
      {(feedback || error) && (
        <div className="fixed right-5 top-24 z-50 max-w-md shadow-xl">
          <Alert type={error ? 'error' : 'success'}>{error || feedback}</Alert>
        </div>
      )}

      <div className="mb-7 flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm">
        {(['slides', 'banners', 'footer'] as AdminHomeTab[]).map((item) => (
          <button
            className={`rounded-xl px-5 py-3 text-sm font-semibold ${
              tab === item ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
            key={item}
            onClick={() => {
              setTab(item)
              setError('')
              setFeedback('')
            }}
            type="button"
          >
            {item === 'slides' ? 'Slider' : item === 'banners' ? 'Banners' : 'Footer'}
          </button>
        ))}
      </div>

      {tab === 'slides' && (
        <CrudSection
          form={
            <form className="space-y-4" onSubmit={saveSlide}>
              <Input id="slide-eyebrow" label="Nome pequeno / categoria" onChange={(event) => setSlideForm((current) => ({ ...current, eyebrow: event.target.value }))} value={slideForm.eyebrow} />
              <Input id="slide-title" label="Titulo" onChange={(event) => setSlideForm((current) => ({ ...current, title: event.target.value }))} required value={slideForm.title} />
              <TextArea label="Descricao" onChange={(value) => setSlideForm((current) => ({ ...current, description: value }))} value={slideForm.description} />
              <div className="grid gap-4 md:grid-cols-2">
                <Select label="Tema" onChange={(value) => setSlideForm((current) => ({ ...current, theme: value as SlideTheme }))} value={slideForm.theme}>
                  <option value="focus">Azul</option>
                  <option value="balance">Verde</option>
                  <option value="growth">Roxo</option>
                </Select>
                <Input id="slide-order" label="Ordem" onChange={(event) => setSlideForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))} type="number" value={slideForm.sortOrder} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Input id="slide-button" label="Texto do botao" onChange={(event) => setSlideForm((current) => ({ ...current, buttonLabel: event.target.value }))} value={slideForm.buttonLabel} />
                <Input id="slide-url" label="Link do botao" onChange={(event) => setSlideForm((current) => ({ ...current, buttonUrl: event.target.value }))} value={slideForm.buttonUrl} />
              </div>
              <Input id="slide-image" label="URL da imagem de fundo" onChange={(event) => setSlideForm((current) => ({ ...current, imageUrl: event.target.value }))} value={slideForm.imageUrl} />
              <CheckBox checked={Boolean(slideForm.active)} label="Slide ativo" onChange={(checked) => setSlideForm((current) => ({ ...current, active: checked }))} />
              <Button className="w-full" type="submit">{editingSlideId ? 'Atualizar slide' : 'Criar slide'}</Button>
            </form>
          }
          items={slides.map((slide) => (
            <Card key={slide.id} title={slide.title || 'Sem titulo'} subtitle={`${slide.eyebrow} - Ordem ${slide.sortOrder ?? 0}`}>
              <p className="text-sm text-slate-500">{slide.description}</p>
              <Actions onDelete={() => void removeSlide(slide.id)} onEdit={() => editSlide(slide)} />
            </Card>
          ))}
          title="Slides cadastrados"
        />
      )}

      {tab === 'banners' && (
        <CrudSection
          form={
            <form className="space-y-4" onSubmit={saveBanner}>
              <Input id="banner-category" label="Categoria" onChange={(event) => setBannerForm((current) => ({ ...current, category: event.target.value }))} value={bannerForm.category} />
              <Input id="banner-title" label="Titulo" onChange={(event) => setBannerForm((current) => ({ ...current, title: event.target.value }))} required value={bannerForm.title} />
              <TextArea label="Descricao" onChange={(value) => setBannerForm((current) => ({ ...current, description: value }))} value={bannerForm.description} />
              <Input id="banner-image" label="URL da imagem" onChange={(event) => setBannerForm((current) => ({ ...current, imageUrl: event.target.value }))} value={bannerForm.imageUrl} />
              <Input id="banner-order" label="Ordem" onChange={(event) => setBannerForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))} type="number" value={bannerForm.sortOrder} />
              <CheckBox checked={Boolean(bannerForm.active)} label="Banner ativo" onChange={(checked) => setBannerForm((current) => ({ ...current, active: checked }))} />
              <Button className="w-full" type="submit">{editingBannerId ? 'Atualizar banner' : 'Criar banner'}</Button>
            </form>
          }
          items={banners.map((banner) => (
            <Card key={banner.id} title={banner.title || 'Sem titulo'} subtitle={`${banner.category} - Ordem ${banner.sortOrder ?? 0}`}>
              <p className="text-sm text-slate-500">{banner.description}</p>
              <Actions onDelete={() => void removeBanner(banner.id)} onEdit={() => editBanner(banner)} />
            </Card>
          ))}
          title="Banners cadastrados"
        />
      )}

      {tab === 'footer' && (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <Panel title="Informacoes de contato">
              <form className="space-y-4" onSubmit={saveFooter}>
                <TextArea label="Descricao" onChange={(value) => setFooterForm((current) => ({ ...current, footerDescription: value }))} value={footerForm.footerDescription} />
                <Input id="footer-email" label="E-mail" onChange={(event) => setFooterForm((current) => ({ ...current, footerEmail: event.target.value }))} value={footerForm.footerEmail} />
                <Input id="footer-phone" label="Telefone" onChange={(event) => setFooterForm((current) => ({ ...current, footerPhone: event.target.value }))} value={footerForm.footerPhone} />
                <Input id="footer-address" label="Endereco" onChange={(event) => setFooterForm((current) => ({ ...current, footerAddress: event.target.value }))} value={footerForm.footerAddress} />
                <Button className="w-full" type="submit">Salvar contato</Button>
              </form>
            </Panel>
            <Panel title="Grupo do footer">
              <form className="space-y-4" onSubmit={saveGroup}>
                <Input id="footer-group-title" label="Titulo do grupo" onChange={(event) => setGroupForm((current) => ({ ...current, title: event.target.value }))} value={groupForm.title} />
                <Input id="footer-group-order" label="Ordem" onChange={(event) => setGroupForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))} type="number" value={groupForm.sortOrder} />
                <Button className="w-full" type="submit">{editingGroupId ? 'Atualizar grupo' : 'Criar grupo'}</Button>
              </form>
            </Panel>
            <Panel title="Link do footer">
              <form className="space-y-4" onSubmit={saveLink}>
                <Select label="Grupo" onChange={(value) => setLinkForm((current) => ({ ...current, groupId: value }))} value={linkForm.groupId}>
                  <option value="">Selecione...</option>
                  {footerGroups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}
                </Select>
                <Input id="footer-link-label" label="Nome do link" onChange={(event) => setLinkForm((current) => ({ ...current, label: event.target.value }))} value={linkForm.label} />
                <Input id="footer-link-url" label="URL" onChange={(event) => setLinkForm((current) => ({ ...current, url: event.target.value }))} value={linkForm.url} />
                <Input id="footer-link-order" label="Ordem" onChange={(event) => setLinkForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))} type="number" value={linkForm.sortOrder} />
                <CheckBox checked={linkForm.active} label="Link ativo" onChange={(checked) => setLinkForm((current) => ({ ...current, active: checked }))} />
                <Button className="w-full" type="submit">{editingLinkId ? 'Atualizar link' : 'Criar link'}</Button>
              </form>
            </Panel>
          </div>
          <Panel title="Estrutura atual do footer">
            <div className="space-y-4">
              {footerGroups.map((group) => (
                <Card key={group.id} title={group.title || 'Grupo sem titulo'} subtitle={`Ordem ${group.sortOrder}`}>
                  <Actions onDelete={() => void removeGroup(group.id)} onEdit={() => editGroup(group)} />
                  <div className="mt-4 space-y-2">
                    {group.links.map((link) => (
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm" key={link.id}>
                        <span>{link.label}</span>
                        <Actions onDelete={() => void removeLink(link.id)} onEdit={() => editLink(link)} />
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
              {footerGroups.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nenhum grupo cadastrado.</p>}
            </div>
          </Panel>
        </div>
      )}
    </>
  )
}

export function AdminHomePage() {
  return (
    <AdminLayout title="Configuracoes">
      <AdminHomeSettingsPanel />
    </AdminLayout>
  )
}

function CrudSection({ form, items, title }: { form: React.ReactNode; items: React.ReactNode[]; title: string }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Formulario">{form}</Panel>
      <Panel title={title}>
        <div className="space-y-4">{items.length ? items : <p className="py-8 text-center text-sm text-slate-500">Nenhum registro cadastrado.</p>}</div>
      </Panel>
    </div>
  )
}

function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"><h3 className="mb-5 text-lg font-semibold text-slate-900">{title}</h3>{children}</section>
}

function Card({ children, subtitle, title }: { children: React.ReactNode; subtitle: string; title: string }) {
  return <article className="rounded-2xl border border-slate-100 p-4"><p className="font-semibold text-slate-900">{title}</p><p className="mt-1 text-xs text-slate-500">{subtitle}</p><div className="mt-3">{children}</div></article>
}

function Actions({ onDelete, onEdit }: { onDelete: () => void; onEdit: () => void }) {
  return <div className="mt-3 flex gap-4 text-sm font-semibold"><button className="text-indigo-600" onClick={onEdit} type="button">Editar</button><button className="text-rose-600" onClick={onDelete} type="button">Excluir</button></div>
}

function Select({ children, label, onChange, value }: { children: React.ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return <label className="block space-y-2 text-sm font-medium text-slate-700"><span>{label}</span><select className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm" onChange={(event) => onChange(event.target.value)} value={value}>{children}</select></label>
}

function TextArea({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="block space-y-2 text-sm font-medium text-slate-700"><span>{label}</span><textarea className="min-h-28 w-full rounded-xl border border-slate-200 bg-white p-4 text-sm outline-none focus:border-indigo-500" onChange={(event) => onChange(event.target.value)} value={value} /></label>
}

function CheckBox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>
}
