interface ViaCepResponse {
  erro?: boolean
  logradouro: string
  complemento: string
  bairro: string
  ibge: string
  localidade: string
  uf: string
}

export interface CepAddress {
  cep: string
  address: string
  neighborhood: string
  city: string
  ibge: string
  state: string
  complement: string
  fullAddress: string
}

export async function findAddressDetailsByCep(cep: string): Promise<CepAddress> {
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

  const fullAddress = [data.logradouro, data.bairro, `${data.localidade}/${data.uf}`, data.complemento]
    .filter(Boolean)
    .join(' - ')

  return {
    cep: cleanCep.replace(/^(\d{5})(\d{3})$/, '$1-$2'),
    address: data.logradouro,
    neighborhood: data.bairro,
    city: data.localidade,
    ibge: data.ibge,
    state: data.uf,
    complement: data.complemento,
    fullAddress,
  }
}

export async function findAddressByCep(cep: string) {
  return (await findAddressDetailsByCep(cep)).fullAddress
}
