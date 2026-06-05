export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'https://api.exemplo.local'

type RequestOptions = RequestInit & {
  token?: string
}

export const api = {
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { token, headers, ...requestOptions } = options
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestOptions,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    })

    if (!response.ok) {
      throw new Error('Não foi possível concluir a solicitação.')
    }

    return response.json() as Promise<T>
  },
}

// A autenticação atual é mockada. Este cliente ficará pronto para a integração real.
