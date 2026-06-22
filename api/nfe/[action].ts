import { proxyNfePost, type VercelRequest, type VercelResponse } from '../_utils/nfeBackendProxy.js'

type RoutedRequest = VercelRequest & {
  query?: {
    action?: string | string[]
  }
}

const routeMap: Record<string, string> = {
  'assinar-xml': '/api/nfe/assinar-xml',
  authorize: '/api/nfe/authorize',
  cancelar: '/api/nfe/cancelar',
  'consultar-chave': '/api/nfe/consultar-chave',
  'consultar-retorno': '/api/nfe/consultar-retorno',
  drafts: '/api/nfe/drafts',
  emitir: '/api/nfe/emitir',
  'generate-xml': '/api/nfe/generate-xml',
  'gerar-xml': '/api/nfe/gerar-xml',
  inutilizar: '/api/nfe/inutilizar',
  sign: '/api/nfe/sign',
  'tax-preview': '/api/nfe/tax-preview',
  validate: '/api/nfe/validate',
}

export default async function handler(req: RoutedRequest, res: VercelResponse) {
  const action = Array.isArray(req.query?.action) ? req.query?.action[0] : req.query?.action

  if (!action || !routeMap[action]) {
    return res.status(404).json({ ok: false, error: 'Rota NF-e nao encontrada.' })
  }

  return proxyNfePost(req, res, routeMap[action])
}
