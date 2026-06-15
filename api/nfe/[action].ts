import { proxyNfePost, type VercelRequest, type VercelResponse } from '../_utils/nfeBackendProxy.js'

type RoutedRequest = VercelRequest & {
  query?: {
    action?: string | string[]
  }
}

const allowedActions = new Set(['authorize', 'drafts', 'generate-xml', 'sign', 'tax-preview', 'validate'])

export default async function handler(req: RoutedRequest, res: VercelResponse) {
  const action = Array.isArray(req.query?.action) ? req.query?.action[0] : req.query?.action

  if (!action || !allowedActions.has(action)) {
    return res.status(404).json({ ok: false, error: 'Rota NF-e nao encontrada.' })
  }

  return proxyNfePost(req, res, `/api/nfe/${action}`)
}
