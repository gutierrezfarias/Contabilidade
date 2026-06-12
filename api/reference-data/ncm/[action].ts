import { proxyFiscalBackend, type VercelRequest, type VercelResponse } from '../../../_utils/nfeBackendProxy'

type RoutedRequest = VercelRequest & {
  query?: {
    action?: string | string[]
    limit?: string | string[]
    query?: string | string[]
  }
}

const allowedActions = new Set(['search', 'sync', 'sync-status'])

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export default async function handler(req: RoutedRequest, res: VercelResponse) {
  const action = first(req.query?.action)

  if (!action) {
    return res.status(404).json({ ok: false, error: 'Rota NCM nao encontrada.' })
  }

  if (allowedActions.has(action)) {
    const search = new URLSearchParams()
    if (action === 'search') {
      search.set('query', first(req.query?.query))
      search.set('limit', first(req.query?.limit) || '20')
    }

    return proxyFiscalBackend(
      req,
      res,
      `/api/reference-data/ncm/${action}${search.size ? `?${search.toString()}` : ''}`,
      action === 'sync' ? ['POST'] : ['GET'],
    )
  }

  const ncmCode = action.replace(/\D/g, '')
  if (ncmCode.length !== 8) {
    return res.status(404).json({ ok: false, error: 'Informe um codigo NCM com 8 digitos.' })
  }

  return proxyFiscalBackend(req, res, `/api/reference-data/ncm/${ncmCode}`, ['GET'])
}
