import { proxyNfePost, type VercelRequest, type VercelResponse } from '../_utils/nfeBackendProxy.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return proxyNfePost(req, res, '/api/dfe/sync')
}
