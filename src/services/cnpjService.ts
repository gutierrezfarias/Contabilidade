export type CnpjApiResponse = Record<string, unknown>

export async function consultPublicCnpj(cnpjDigits: string): Promise<CnpjApiResponse> {
  try {
    const response = await fetch(`https://publica.cnpj.ws/cnpj/${cnpjDigits}`)

    if (response.status === 404) {
      throw new Error('CNPJ nao encontrado.')
    }

    if (response.status === 429) {
      throw new Error('Limite de requisicoes atingido. Aguarde um pouco e tente novamente.')
    }

    if (!response.ok) {
      throw new Error('Erro inesperado ao consultar a API publica.')
    }

    return (await response.json()) as CnpjApiResponse
  } catch (error: unknown) {
    if (error instanceof Error && error.message !== 'Failed to fetch') {
      throw error
    }

    throw new Error('Erro de conexao ao consultar o CNPJ.', { cause: error })
  }
}
