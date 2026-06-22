export const ACCOUNTING_DOCUMENT_BUCKET = 'accounting-documents'
export const ACCOUNTING_DOCUMENT_MAX_SIZE_BYTES = 25 * 1024 * 1024

const dangerousExtensions = new Set([
  'bat',
  'cmd',
  'com',
  'dll',
  'exe',
  'hta',
  'jar',
  'js',
  'jse',
  'lnk',
  'msi',
  'ps1',
  'scr',
  'sh',
  'vbs',
  'wsf',
  'xlsm',
])

const allowedExtensions = new Set([
  'csv',
  'doc',
  'docx',
  'jpeg',
  'jpg',
  'json',
  'pdf',
  'png',
  'txt',
  'xls',
  'xlsx',
  'xml',
])

const allowedMimeTypes = new Set([
  'application/json',
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/xml',
  'image/jpeg',
  'image/png',
  'text/csv',
  'text/plain',
  'text/xml',
])

export interface AccountingDocumentValidationResult {
  extension: string
  ok: boolean
  reason: string
  safeName: string
}

export function getFileExtension(fileName: string) {
  const cleanName = fileName.trim().toLowerCase()
  const lastDot = cleanName.lastIndexOf('.')
  return lastDot >= 0 ? cleanName.slice(lastDot + 1) : ''
}

export function hasPathTraversal(fileName: string) {
  const normalized = fileName.replaceAll('\\', '/')
  return normalized.includes('../') || normalized.includes('/..') || normalized.includes('/') || normalized.includes(':')
}

export function sanitizeDocumentFileName(fileName: string) {
  const sanitized = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')

  return sanitized || `documento-${Date.now()}`
}

export function validateAccountingDocumentFile(file: File): AccountingDocumentValidationResult {
  const extension = getFileExtension(file.name)
  const safeName = sanitizeDocumentFileName(file.name)

  if (hasPathTraversal(file.name)) {
    return { extension, ok: false, reason: 'Nome de arquivo invalido ou com caminho embutido.', safeName }
  }

  if (!extension || !allowedExtensions.has(extension)) {
    return { extension, ok: false, reason: 'Extensao de arquivo nao permitida.', safeName }
  }

  if (dangerousExtensions.has(extension)) {
    return { extension, ok: false, reason: 'Arquivos executaveis, scripts ou macros nao sao permitidos.', safeName }
  }

  if (file.size <= 0) {
    return { extension, ok: false, reason: 'Arquivo vazio nao pode ser enviado.', safeName }
  }

  if (file.size > ACCOUNTING_DOCUMENT_MAX_SIZE_BYTES) {
    return { extension, ok: false, reason: 'Arquivo acima do limite de 25 MB.', safeName }
  }

  if (file.type && !allowedMimeTypes.has(file.type)) {
    return { extension, ok: false, reason: 'Tipo MIME nao permitido para documentos contabeis.', safeName }
  }

  return { extension, ok: true, reason: '', safeName }
}

export async function sha256File(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
