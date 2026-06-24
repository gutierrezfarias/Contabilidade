type IbgeMunicipality = {
  id: number
  nome: string
  microrregiao?: {
    mesorregiao?: {
      UF?: {
        sigla?: string
      }
    }
  }
}

export type MunicipalityResolution = {
  code: string
  name: string
  stateUf: string
  matched: boolean
  source: 'ibge'
}

const cache = new Map<string, MunicipalityResolution | null>()

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export async function resolveMunicipalityByCityUf(city: string, stateUf: string): Promise<MunicipalityResolution | null> {
  const normalizedCity = normalizeText(city)
  const uf = stateUf.trim().toUpperCase().slice(0, 2)

  if (!normalizedCity || uf.length !== 2) {
    return null
  }

  const key = `${normalizedCity}:${uf}`
  if (cache.has(key)) {
    return cache.get(key) ?? null
  }

  const response = await fetch(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios`,
  )

  if (!response.ok) {
    cache.set(key, null)
    return null
  }

  const municipalities = (await response.json()) as IbgeMunicipality[]
  const match = municipalities.find((item) => normalizeText(item.nome) === normalizedCity)
    ?? municipalities.find((item) => normalizeText(item.nome).includes(normalizedCity))

  const result = match
    ? {
        code: String(match.id),
        matched: true,
        name: match.nome,
        source: 'ibge' as const,
        stateUf: uf,
      }
    : null

  cache.set(key, result)
  return result
}
