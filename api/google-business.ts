/// <reference types="node" />

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import process from 'node:process'

type VercelRequest = {
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, string | string[] | undefined>
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => VercelResponse
  end: (body?: string) => void
}

type User = {
  id: string
  email?: string
}

type ConnectionRow = {
  id: string
  accountant_id: string
  google_account_id: string
  access_token: string
  refresh_token: string
  token_expires_at: string
  connected_email: string
  status: string
  oauth_state: string
  updated_at: string
}

type LocationRow = {
  id: string
  accountant_id: string
  google_connection_id: string
  google_location_name: string
  google_location_id: string
  business_name: string
  address: string
  phone: string
  website: string
  sync_status: string
  selected: boolean
  google_payload: Record<string, unknown> | null
  last_checked_at: string
  last_synced_at: string
  created_at: string
  updated_at: string
}

type CompanySettingsRow = {
  company_name?: string
  phone?: string
  whatsapp?: string
  cep?: string
  address?: string
  address_complement?: string
  neighborhood?: string
  city?: string
  state?: string
  website?: string
  opening_hours?: string
  business_description?: string
}

type GoogleLocation = {
  name?: string
  title?: string
  phoneNumbers?: { primaryPhone?: string }
  storefrontAddress?: {
    addressLines?: string[]
    locality?: string
    administrativeArea?: string
    postalCode?: string
    regionCode?: string
  }
  websiteUri?: string
  regularHours?: unknown
  profile?: { description?: string }
}

type ComparisonRow = {
  key: string
  label: string
  systemValue: string
  googleValue: string
  status: 'Atualizado' | 'Desatualizado' | 'Pendente' | 'Erro'
  googleField: string
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI
const googleBusinessBaseUrl =
  process.env.GOOGLE_BUSINESS_PROFILE_API_BASE_URL ??
  'https://mybusinessbusinessinformation.googleapis.com/v1'
const googleAccountBaseUrl = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const locationReadMask = 'name,title,phoneNumbers,storefrontAddress,websiteUri,regularHours,profile'

function getHeader(req: VercelRequest, name: string) {
  const value = Object.entries(req.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function getQuery(req: VercelRequest, name: string) {
  const value = req.query?.[name]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function parseBody(body: unknown) {
  if (typeof body === 'string') {
    return JSON.parse(body) as Record<string, unknown>
  }

  return (body ?? {}) as Record<string, unknown>
}

function appOrigin(req: VercelRequest) {
  const host = getHeader(req, 'host')
  const protocol = getHeader(req, 'x-forwarded-proto') || 'https'
  return process.env.APP_URL ?? `${protocol}://${host}`
}

function redirect(res: VercelResponse, url: string) {
  res.status(302).setHeader('Location', url).end()
}

function normalize(value: unknown) {
  return String(value ?? '').trim()
}

function cleanPhone(value: string) {
  return value.replace(/\D/g, '')
}

function compactJson(value: unknown) {
  if (!value) return ''
  return JSON.stringify(value)
}

function getGoogleAddress(location: GoogleLocation) {
  const address = location.storefrontAddress
  return [
    ...(address?.addressLines ?? []),
    address?.locality,
    address?.administrativeArea,
    address?.postalCode,
  ]
    .filter(Boolean)
    .join(', ')
}

function mapLocation(row: LocationRow) {
  return {
    id: row.id,
    accountantId: row.accountant_id,
    googleConnectionId: row.google_connection_id,
    googleLocationName: row.google_location_name,
    googleLocationId: row.google_location_id,
    businessName: row.business_name,
    address: row.address,
    phone: row.phone,
    website: row.website,
    syncStatus: row.sync_status,
    selected: row.selected,
    googlePayload: row.google_payload ?? undefined,
    lastCheckedAt: row.last_checked_at,
    lastSyncedAt: row.last_synced_at,
  }
}

function mapConnection(row: ConnectionRow | null) {
  if (!row) return null

  return {
    id: row.id,
    accountantId: row.accountant_id,
    connectedEmail: row.connected_email,
    status: row.status,
    tokenExpiresAt: row.token_expires_at,
    updatedAt: row.updated_at,
  }
}

function compareField(
  key: string,
  label: string,
  systemValue: string,
  googleValue: string,
  googleField: string,
): ComparisonRow {
  const hasAnyValue = Boolean(systemValue || googleValue)
  const same =
    key === 'phone'
      ? cleanPhone(systemValue) === cleanPhone(googleValue)
      : normalize(systemValue).toLowerCase() === normalize(googleValue).toLowerCase()

  return {
    key,
    label,
    systemValue: systemValue || 'Nao informado',
    googleValue: googleValue || 'Nao informado',
    status: hasAnyValue ? (same ? 'Atualizado' : 'Desatualizado') : 'Pendente',
    googleField,
  }
}

function buildComparison(settings: CompanySettingsRow | null, googleLocation?: GoogleLocation): ComparisonRow[] {
  const google = googleLocation ?? {}
  const googleAddress = google.storefrontAddress

  return [
    compareField('companyName', 'Nome da empresa', settings?.company_name ?? '', google.title ?? '', 'title'),
    compareField('phone', 'Telefone', settings?.phone ?? '', google.phoneNumbers?.primaryPhone ?? '', 'phoneNumbers'),
    compareField('whatsapp', 'WhatsApp', settings?.whatsapp ?? '', '', ''),
    compareField(
      'address',
      'Endereco',
      [settings?.address, settings?.address_complement, settings?.neighborhood].filter(Boolean).join(', '),
      (googleAddress?.addressLines ?? []).join(', '),
      'storefrontAddress',
    ),
    compareField('city', 'Cidade', settings?.city ?? '', googleAddress?.locality ?? '', 'storefrontAddress'),
    compareField('state', 'Estado', settings?.state ?? '', googleAddress?.administrativeArea ?? '', 'storefrontAddress'),
    compareField('cep', 'CEP', settings?.cep ?? '', googleAddress?.postalCode ?? '', 'storefrontAddress'),
    compareField('website', 'Site', settings?.website ?? '', google.websiteUri ?? '', 'websiteUri'),
    compareField('openingHours', 'Horario de funcionamento', settings?.opening_hours ?? '', compactJson(google.regularHours), 'regularHours'),
    compareField('businessDescription', 'Descricao da empresa', settings?.business_description ?? '', google.profile?.description ?? '', 'profile'),
  ]
}

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Configure SUPABASE_SERVICE_ROLE_KEY e VITE_SUPABASE_URL na Vercel.')
  }

  return createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
}

function assertGoogleEnv() {
  if (!googleClientId || !googleClientSecret || !googleRedirectUri) {
    throw new Error('Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI na Vercel.')
  }
}

async function requireUser(req: VercelRequest) {
  const supabase = getSupabase()
  const authorization = getHeader(req, 'authorization')
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim()

  if (!accessToken) {
    throw new Error('Login obrigatorio para acessar Google Business Profile.')
  }

  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data.user) {
    throw new Error('Sessao invalida. Entre novamente.')
  }

  return { supabase, user: data.user as User }
}

async function ensureOrganizationAccess(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  organizationId: string,
) {
  if (!organizationId) {
    throw new Error('Organizacao nao informada.')
  }

  const [{ data: role }, { data: member }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
    supabase
      .from('organization_members')
      .select('organization_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (role?.role !== 'admin' && !member) {
    throw new Error('Voce nao tem acesso a esta empresa.')
  }
}

async function googleFetch<T>(url: string, accessToken: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  const result = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } }

  if (!response.ok) {
    throw new Error(result.error?.message ?? 'Google recusou a solicitacao.')
  }

  return result
}

async function getConnection(supabase: ReturnType<typeof createClient>, organizationId: string) {
  const { data, error } = await supabase
    .from('accountant_google_connections')
    .select('*')
    .eq('accountant_id', organizationId)
    .neq('status', 'Desconectado')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data ?? null) as ConnectionRow | null
}

async function getValidAccessToken(supabase: ReturnType<typeof createClient>, connection: ConnectionRow) {
  assertGoogleEnv()

  if (connection.access_token && new Date(connection.token_expires_at).getTime() > Date.now() + 60_000) {
    return connection.access_token
  }

  if (!connection.refresh_token) {
    throw new Error('Conexao Google sem refresh token. Reconecte a conta.')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleClientId ?? '',
      client_secret: googleClientSecret ?? '',
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token,
    }),
  })
  const tokenData = (await response.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error_description?: string
  }

  if (!response.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description ?? 'Nao foi possivel renovar o token Google.')
  }

  const tokenExpiresAt = new Date(Date.now() + Number(tokenData.expires_in ?? 3600) * 1000).toISOString()
  await supabase
    .from('accountant_google_connections')
    .update({
      access_token: tokenData.access_token,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)

  return tokenData.access_token
}

async function loadSettings(supabase: ReturnType<typeof createClient>, organizationId: string) {
  const { data, error } = await supabase
    .from('company_settings')
    .select('company_name, phone, whatsapp, cep, address, address_complement, neighborhood, city, state, website, opening_hours, business_description')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data ?? null) as CompanySettingsRow | null
}

async function loadStatus(supabase: ReturnType<typeof createClient>, organizationId: string) {
  const [connectionResult, locationsResult, logsResult, settings] = await Promise.all([
    getConnection(supabase, organizationId),
    supabase
      .from('accountant_google_locations')
      .select('*')
      .eq('accountant_id', organizationId)
      .order('created_at', { ascending: false }),
    supabase
      .from('google_sync_logs')
      .select('*')
      .eq('accountant_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(20),
    loadSettings(supabase, organizationId),
  ])

  if (locationsResult.error) throw new Error(locationsResult.error.message)
  if (logsResult.error) throw new Error(logsResult.error.message)

  const selected = ((locationsResult.data ?? []) as LocationRow[]).find((location) => location.selected)
  return {
    connection: mapConnection(connectionResult),
    locations: ((locationsResult.data ?? []) as LocationRow[]).map(mapLocation),
    logs: (logsResult.data ?? []).map((log) => ({
      id: log.id,
      accountantId: log.accountant_id,
      googleLocationId: log.google_location_id,
      action: log.action,
      userEmail: log.user_email ?? '',
      fieldsSent: log.fields_sent ?? [],
      oldValues: log.old_values ?? {},
      newValues: log.new_values ?? {},
      status: log.status,
      errorMessage: log.error_message ?? '',
      createdAt: log.created_at,
    })),
    comparison: buildComparison(settings, selected?.google_payload as GoogleLocation | undefined),
  }
}

async function handleStartOAuth(req: VercelRequest, res: VercelResponse) {
  assertGoogleEnv()
  const { supabase, user } = await requireUser(req)
  const organizationId = getQuery(req, 'organizationId')
  await ensureOrganizationAccess(supabase, user.id, organizationId)

  const state = randomBytes(24).toString('hex')
  await supabase.from('accountant_google_connections').upsert(
    {
      accountant_id: organizationId,
      oauth_state: state,
      status: 'Pendente',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'accountant_id' },
  )

  const params = new URLSearchParams({
    access_type: 'offline',
    client_id: googleClientId ?? '',
    prompt: 'consent',
    redirect_uri: googleRedirectUri ?? '',
    response_type: 'code',
    scope: 'profile email https://www.googleapis.com/auth/business.manage',
    state,
  })

  return res.status(200).json({ ok: true, authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
}

async function handleOAuthCallback(req: VercelRequest, res: VercelResponse) {
  assertGoogleEnv()
  const supabase = getSupabase()
  const code = getQuery(req, 'code')
  const state = getQuery(req, 'state')
  const error = getQuery(req, 'error')

  if (error) {
    return redirect(res, `${appOrigin(req)}/configuracoes-contabeis?aba=google&google=error`)
  }

  const { data: connection } = await supabase
    .from('accountant_google_connections')
    .select('*')
    .eq('oauth_state', state)
    .maybeSingle()

  if (!code || !connection) {
    return redirect(res, `${appOrigin(req)}/configuracoes-contabeis?aba=google&google=error`)
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleClientId ?? '',
      client_secret: googleClientSecret ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: googleRedirectUri ?? '',
    }),
  })
  const tokenData = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }

  if (!tokenResponse.ok || !tokenData.access_token) {
    return redirect(res, `${appOrigin(req)}/configuracoes-contabeis?aba=google&google=error`)
  }

  const profile = await googleFetch<{ email?: string; id?: string }>(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    tokenData.access_token,
    { method: 'GET' },
  ).catch(() => ({ email: '', id: '' }))

  await supabase
    .from('accountant_google_connections')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? connection.refresh_token ?? '',
      token_expires_at: new Date(Date.now() + Number(tokenData.expires_in ?? 3600) * 1000).toISOString(),
      connected_email: profile.email ?? '',
      google_account_id: profile.id ?? '',
      oauth_state: '',
      status: 'Conectado',
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)

  return redirect(res, `${appOrigin(req)}/configuracoes-contabeis?aba=google&google=connected`)
}

async function handleLocations(req: VercelRequest, res: VercelResponse) {
  const { supabase, user } = await requireUser(req)
  const organizationId = getQuery(req, 'organizationId')
  await ensureOrganizationAccess(supabase, user.id, organizationId)

  const connection = await getConnection(supabase, organizationId)
  if (!connection) throw new Error('Conecte o Google antes de listar empresas.')
  const accessToken = await getValidAccessToken(supabase, connection)

  const accountsResponse = await googleFetch<{ accounts?: Array<{ name: string }> }>(
    `${googleAccountBaseUrl}/accounts`,
    accessToken,
    { method: 'GET' },
  )
  const allLocations: GoogleLocation[] = []

  for (const account of accountsResponse.accounts ?? []) {
    const url = `${googleBusinessBaseUrl}/${account.name}/locations?${new URLSearchParams({
      pageSize: '100',
      readMask: locationReadMask,
    })}`
    const locationsResponse = await googleFetch<{ locations?: GoogleLocation[] }>(url, accessToken, { method: 'GET' })
    allLocations.push(...(locationsResponse.locations ?? []))
  }

  for (const location of allLocations) {
    if (!location.name) continue

    await supabase.from('accountant_google_locations').upsert(
      {
        accountant_id: organizationId,
        google_connection_id: connection.id,
        google_location_name: location.name,
        google_location_id: location.name.replace('locations/', ''),
        business_name: location.title ?? '',
        address: getGoogleAddress(location),
        phone: location.phoneNumbers?.primaryPhone ?? '',
        website: location.websiteUri ?? '',
        sync_status: 'Pendente',
        google_payload: location,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'accountant_id,google_location_name' },
    )
  }

  return res.status(200).json({ ok: true, ...(await loadStatus(supabase, organizationId)) })
}

async function handleSelectLocation(req: VercelRequest, res: VercelResponse) {
  const { supabase, user } = await requireUser(req)
  const organizationId = getQuery(req, 'organizationId')
  const body = parseBody(req.body)
  const locationId = String(body.locationId ?? '')

  await ensureOrganizationAccess(supabase, user.id, organizationId)
  if (!locationId) throw new Error('Selecione uma empresa do Google.')

  await supabase.from('accountant_google_locations').update({ selected: false }).eq('accountant_id', organizationId)
  await supabase
    .from('accountant_google_locations')
    .update({ selected: true, sync_status: 'Pendente', updated_at: new Date().toISOString() })
    .eq('accountant_id', organizationId)
    .eq('id', locationId)

  return res.status(200).json({ ok: true, ...(await loadStatus(supabase, organizationId)) })
}

async function handleCheck(req: VercelRequest, res: VercelResponse) {
  const { supabase, user } = await requireUser(req)
  const organizationId = getQuery(req, 'organizationId')
  await ensureOrganizationAccess(supabase, user.id, organizationId)

  const connection = await getConnection(supabase, organizationId)
  if (!connection) throw new Error('Conecte o Google antes de verificar.')

  const { data: selectedLocation } = await supabase
    .from('accountant_google_locations')
    .select('*')
    .eq('accountant_id', organizationId)
    .eq('selected', true)
    .maybeSingle()

  if (!selectedLocation) throw new Error('Selecione qual empresa do Google deseja vincular.')

  const accessToken = await getValidAccessToken(supabase, connection)
  const googleLocation = await googleFetch<GoogleLocation>(
    `${googleBusinessBaseUrl}/${selectedLocation.google_location_name}?${new URLSearchParams({ readMask: locationReadMask })}`,
    accessToken,
    { method: 'GET' },
  )
  const settings = await loadSettings(supabase, organizationId)
  const comparison = buildComparison(settings, googleLocation)
  const hasOutdated = comparison.some((row) => row.status === 'Desatualizado')

  await supabase
    .from('accountant_google_locations')
    .update({
      business_name: googleLocation.title ?? '',
      address: getGoogleAddress(googleLocation),
      phone: googleLocation.phoneNumbers?.primaryPhone ?? '',
      website: googleLocation.websiteUri ?? '',
      google_payload: googleLocation,
      sync_status: hasOutdated ? 'Google desatualizado' : 'Atualizado',
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', selectedLocation.id)

  await supabase.from('google_sync_logs').insert({
    accountant_id: organizationId,
    google_location_id: selectedLocation.id,
    action: 'Verificar dados no Google',
    user_id: user.id,
    user_email: user.email ?? '',
    fields_sent: [],
    old_values: googleLocation,
    new_values: settings ?? {},
    status: hasOutdated ? 'Desatualizado' : 'Atualizado',
  })

  return res.status(200).json({ ok: true, ...(await loadStatus(supabase, organizationId)) })
}

function tryParseJson(text: string) {
  try {
    return text ? JSON.parse(text) as Record<string, unknown> : null
  } catch {
    return null
  }
}

function buildPatchPayload(settings: CompanySettingsRow | null, comparison: ComparisonRow[]) {
  const changed = comparison.filter((row) => row.status === 'Desatualizado' && row.googleField)
  const updateMask = new Set<string>()
  const body: Record<string, unknown> = {}

  for (const row of changed) {
    if (row.googleField === 'title') {
      body.title = settings?.company_name ?? ''
      updateMask.add('title')
    }

    if (row.googleField === 'phoneNumbers') {
      body.phoneNumbers = { primaryPhone: settings?.phone ?? '' }
      updateMask.add('phoneNumbers')
    }

    if (row.googleField === 'storefrontAddress') {
      body.storefrontAddress = {
        addressLines: [settings?.address, settings?.address_complement, settings?.neighborhood].filter(Boolean),
        administrativeArea: settings?.state ?? '',
        locality: settings?.city ?? '',
        postalCode: settings?.cep ?? '',
        regionCode: 'BR',
      }
      updateMask.add('storefrontAddress')
    }

    if (row.googleField === 'websiteUri') {
      body.websiteUri = settings?.website ?? ''
      updateMask.add('websiteUri')
    }

    if (row.googleField === 'profile') {
      body.profile = { description: settings?.business_description ?? '' }
      updateMask.add('profile')
    }

    if (row.googleField === 'regularHours') {
      const regularHours = tryParseJson(settings?.opening_hours ?? '')
      if (regularHours) {
        body.regularHours = regularHours
        updateMask.add('regularHours')
      }
    }
  }

  return {
    body,
    fields: Array.from(updateMask),
  }
}

async function handleSync(req: VercelRequest, res: VercelResponse) {
  const { supabase, user } = await requireUser(req)
  const organizationId = getQuery(req, 'organizationId')
  await ensureOrganizationAccess(supabase, user.id, organizationId)

  const connection = await getConnection(supabase, organizationId)
  if (!connection) throw new Error('Conecte o Google antes de sincronizar.')

  const { data: selectedLocation } = await supabase
    .from('accountant_google_locations')
    .select('*')
    .eq('accountant_id', organizationId)
    .eq('selected', true)
    .maybeSingle()

  if (!selectedLocation) throw new Error('Selecione qual empresa do Google deseja vincular.')

  const settings = await loadSettings(supabase, organizationId)
  const comparison = buildComparison(settings, selectedLocation.google_payload as GoogleLocation)
  const patch = buildPatchPayload(settings, comparison)

  if (!patch.fields.length) {
    return res.status(200).json({ ok: true, ...(await loadStatus(supabase, organizationId)) })
  }

  const accessToken = await getValidAccessToken(supabase, connection)

  try {
    const updatedLocation = await googleFetch<GoogleLocation>(
      `${googleBusinessBaseUrl}/${selectedLocation.google_location_name}?${new URLSearchParams({
        updateMask: patch.fields.join(','),
      })}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify({
          name: selectedLocation.google_location_name,
          ...patch.body,
        }),
      },
    )

    await supabase
      .from('accountant_google_locations')
      .update({
        google_payload: updatedLocation,
        sync_status: 'Pendente de analise',
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedLocation.id)

    await supabase.from('google_sync_logs').insert({
      accountant_id: organizationId,
      google_location_id: selectedLocation.id,
      action: 'Mandar atualizar no Google',
      user_id: user.id,
      user_email: user.email ?? '',
      fields_sent: patch.fields,
      old_values: selectedLocation.google_payload ?? {},
      new_values: patch.body,
      status: 'Enviado',
    })
  } catch (syncError) {
    await supabase.from('google_sync_logs').insert({
      accountant_id: organizationId,
      google_location_id: selectedLocation.id,
      action: 'Mandar atualizar no Google',
      user_id: user.id,
      user_email: user.email ?? '',
      fields_sent: patch.fields,
      old_values: selectedLocation.google_payload ?? {},
      new_values: patch.body,
      status: 'Erro',
      error_message: syncError instanceof Error ? syncError.message : 'Erro inesperado.',
    })
    throw syncError
  }

  return res.status(200).json({ ok: true, ...(await loadStatus(supabase, organizationId)) })
}

async function handleDisconnect(req: VercelRequest, res: VercelResponse) {
  const { supabase, user } = await requireUser(req)
  const organizationId = getQuery(req, 'organizationId')
  await ensureOrganizationAccess(supabase, user.id, organizationId)

  await supabase
    .from('accountant_google_connections')
    .update({
      access_token: '',
      refresh_token: '',
      status: 'Desconectado',
      updated_at: new Date().toISOString(),
    })
    .eq('accountant_id', organizationId)

  await supabase
    .from('accountant_google_locations')
    .update({
      selected: false,
      sync_status: 'Nao vinculado',
      updated_at: new Date().toISOString(),
    })
    .eq('accountant_id', organizationId)

  return res.status(200).json({ ok: true, ...(await loadStatus(supabase, organizationId)) })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = getQuery(req, 'action')

  try {
    if (req.method === 'GET' && action === 'callback') return await handleOAuthCallback(req, res)

    if (req.method === 'GET' && action === 'status') {
      const { supabase, user } = await requireUser(req)
      const organizationId = getQuery(req, 'organizationId')
      await ensureOrganizationAccess(supabase, user.id, organizationId)
      return res.status(200).json({ ok: true, ...(await loadStatus(supabase, organizationId)) })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    if (action === 'start-oauth') return await handleStartOAuth(req, res)
    if (action === 'locations') return await handleLocations(req, res)
    if (action === 'select-location') return await handleSelectLocation(req, res)
    if (action === 'check') return await handleCheck(req, res)
    if (action === 'sync') return await handleSync(req, res)
    if (action === 'disconnect') return await handleDisconnect(req, res)

    return res.status(404).json({ ok: false, error: 'Acao Google nao encontrada.' })
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Nao foi possivel executar a integracao Google.',
    })
  }
}
