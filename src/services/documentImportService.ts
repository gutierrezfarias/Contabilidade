import { supabase } from './supabase'
import * as pdfjs from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'

export type ImportedClientDocument = {
  bairro: string
  cep: string
  cidade: string
  cnaePrincipal: string
  cnpj: string
  complemento: string
  email: string
  endereco: string
  estado: string
  naturezaJuridica: string
  nomeFantasia: string
  numero: string
  porte: string
  razaoSocial: string
  regimeTributario: string
  situacaoCadastral: string
  telefone: string
}

export type DocumentImportResult = {
  cnpjs: string[]
  options: ImportedClientDocument[]
  sourceFile: ImportedClientDocumentFile
  textPreview: string
}

export type ImportedClientDocumentFile = {
  dataUrl: string
  fileName: string
  fileSize: number
  mimeType: string
}

type ApiDocumentImportResult = {
  cnpjs?: string[]
  data?: ImportedClientDocument
  error?: string
  options?: ImportedClientDocument[]
  textPreview?: string
}

const cnpjRegex = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

function httpErrorMessage(status: number, rawBody: string) {
  if (status === 404) {
    return 'Endpoint de importacao nao encontrado. Publique novamente o projeto na Vercel para incluir a API.'
  }

  if (status === 500) {
    return 'A API de importacao falhou na Vercel. Verifique as variaveis de ambiente e os logs do deploy.'
  }

  return rawBody.trim() || 'Nao foi possivel importar este documento.'
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function validateCnpj(value: string) {
  const cnpj = onlyDigits(value)
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false

  const calculateDigit = (base: string, weights: number[]) => {
    const sum = base
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }

  const firstDigit = calculateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const secondDigit = calculateDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

  return firstDigit === Number(cnpj[12]) && secondDigit === Number(cnpj[13])
}

function findCnpjs(text: string) {
  return Array.from(
    new Set(
      (text.match(cnpjRegex) ?? [])
        .map(onlyDigits)
        .filter(validateCnpj),
    ),
  )
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Nao foi possivel guardar o documento importado.'))
    reader.readAsDataURL(file)
  })
}

async function ocrImage(image: File | HTMLCanvasElement) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('por')

  try {
    const result = await worker.recognize(image)
    return result.data.text ?? ''
  } finally {
    await worker.terminate()
  }
}

async function ocrPdfFirstPage(document: pdfjs.PDFDocumentProxy) {
  const page = await document.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = window.document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) return ''

  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)

  await page.render({ canvas, canvasContext: context, viewport }).promise
  return ocrImage(canvas)
}

async function extractPdfText(file: File) {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    disableFontFace: true,
    useWorkerFetch: false,
  })
  const document = await loadingTask.promise
  const pages: string[] = []

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item) => ('str' in item ? String(item.str ?? '') : ''))
        .filter(Boolean)
        .join('\n')

      pages.push(pageText)
    }

    const text = pages.join('\n')
    if (findCnpjs(text).length) return text

    const ocrText = await ocrPdfFirstPage(document)
    return [text, ocrText].filter(Boolean).join('\n')
  } finally {
    await loadingTask.destroy()
  }
}

async function extractDocumentText(file: File) {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractPdfText(file)
  }

  if (file.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name)) {
    return ocrImage(file)
  }

  throw new Error('Envie um PDF, PNG, JPG ou JPEG.')
}

export async function importClientDocument(file: File): Promise<DocumentImportResult> {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token

  if (!accessToken) {
    throw new Error('Sessao expirada. Entre novamente no sistema.')
  }

  const text = await extractDocumentText(file)
  const cnpjs = findCnpjs(text)

  if (!cnpjs.length) {
    throw new Error('Nao foi possivel localizar um CNPJ neste documento. Verifique se o arquivo esta legivel.')
  }

  const response = await fetch('/api/clientes/importar-documento', {
    body: JSON.stringify({
      cnpjs,
      fileName: file.name,
      mimeType: file.type,
      text,
    }),
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  const rawBody = await response.text()
  let result: ApiDocumentImportResult

  try {
    result = rawBody ? (JSON.parse(rawBody) as ApiDocumentImportResult) : {}
  } catch {
    result = {}
  }

  if (!response.ok) {
    throw new Error(result.error ?? httpErrorMessage(response.status, rawBody))
  }

  const options = result.options?.length ? result.options : result.data ? [result.data] : []

  if (!options.length) {
    throw new Error('Nao foi possivel montar a pre-visualizacao do cliente.')
  }

  return {
    cnpjs: result.cnpjs ?? options.map((option) => option.cnpj),
    options,
    sourceFile: {
      dataUrl: await readFileAsDataUrl(file),
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
    },
    textPreview: result.textPreview ?? '',
  }
}
