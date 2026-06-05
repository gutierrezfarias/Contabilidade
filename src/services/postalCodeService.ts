type ViaCepResponse = {
  erro?: boolean
  logradouro: string
  complemento: string
  bairro: string
  localidade: string
  uf: string
}

type ZippopotamusResponse = {
  'post code': string
  places: Array<{
    'place name': string
    state: string
    'state abbreviation'?: string
  }>
}

export type PostalLookupResult = {
  fields: Record<string, string>
  message: string
}

const postalFieldByCountry: Record<string, string> = {
  BR: 'cep',
  PT: 'codigoPostal',
  US: 'zipCode',
}

export function canLookupPostalCode(countryCode: string) {
  return Boolean(postalFieldByCountry[countryCode])
}

export function getPostalFieldKey(countryCode: string) {
  return postalFieldByCountry[countryCode]
}

export async function lookupCompanyAddress(
  countryCode: string,
  postalCode: string,
): Promise<PostalLookupResult> {
  if (countryCode === 'BR') {
    return lookupBrazilianCep(postalCode)
  }

  if (countryCode === 'US' || countryCode === 'PT') {
    return lookupZippopotamus(countryCode, postalCode)
  }

  throw new Error('Preenchimento automatico ainda nao configurado para este pais.')
}

async function lookupBrazilianCep(cep: string): Promise<PostalLookupResult> {
  const cleanCep = cep.replace(/\D/g, '')

  if (cleanCep.length !== 8) {
    throw new Error('Informe um CEP valido com 8 numeros.')
  }

  const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)

  if (!response.ok) {
    throw new Error('Nao foi possivel consultar o CEP.')
  }

  const data = (await response.json()) as ViaCepResponse

  if (data.erro) {
    throw new Error('CEP nao encontrado.')
  }

  return {
    fields: {
      cep: cleanCep.replace(/^(\d{5})(\d{3})$/, '$1-$2'),
      endereco: data.logradouro,
      complemento: data.complemento,
      bairro: data.bairro,
      cidade: data.localidade,
      estado: data.uf,
    },
    message: 'Endereco preenchido pelo ViaCEP.',
  }
}

async function lookupZippopotamus(
  countryCode: 'PT' | 'US',
  postalCode: string,
): Promise<PostalLookupResult> {
  const cleanPostalCode = postalCode.trim()

  if (!cleanPostalCode) {
    throw new Error('Informe o codigo postal.')
  }

  const response = await fetch(
    `https://api.zippopotam.us/${countryCode.toLowerCase()}/${encodeURIComponent(cleanPostalCode)}`,
  )

  if (!response.ok) {
    throw new Error('Codigo postal nao encontrado.')
  }

  const data = (await response.json()) as ZippopotamusResponse
  const place = data.places[0]

  if (!place) {
    throw new Error('Codigo postal sem localidade vinculada.')
  }

  if (countryCode === 'US') {
    return {
      fields: {
        zipCode: data['post code'],
        city: place['place name'],
        state: place['state abbreviation'] || place.state,
      },
      message: 'Cidade e estado preenchidos pelo codigo postal.',
    }
  }

  return {
    fields: {
      codigoPostal: data['post code'],
      localidade: place['place name'],
    },
    message: 'Localidade preenchida pelo codigo postal.',
  }
}
