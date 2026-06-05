import { formatCnpj, formatCurrencyBRL, formatDateValue, formatEmptyValue, formatPhone, formatPostalCode } from '../../utils/formatters'

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function text(value: unknown) {
  return formatEmptyValue(value)
}

export function CompanySummary({ data }: { data: Record<string, unknown> }) {
  const estabelecimento = getRecord(data.estabelecimento)
  const cidade = getRecord(estabelecimento.cidade)
  const estado = getRecord(estabelecimento.estado)
  const naturezaJuridica = getRecord(data.natureza_juridica)
  const porte = getRecord(data.porte)
  const atividadePrincipal = getRecord(estabelecimento.atividade_principal)
  const inscricoes = Array.isArray(estabelecimento.inscricoes_estaduais)
    ? estabelecimento.inscricoes_estaduais
    : Array.isArray(data.inscricoes_estaduais)
      ? data.inscricoes_estaduais
      : []

  const address = [
    estabelecimento.tipo_logradouro,
    estabelecimento.logradouro,
    estabelecimento.numero,
    estabelecimento.complemento,
    estabelecimento.bairro,
  ]
    .filter(Boolean)
    .join(', ')

  const phone = [estabelecimento.ddd1, estabelecimento.telefone1].filter(Boolean).join('')

  const fields = [
    { label: 'Razao social', value: text(data.razao_social) },
    { label: 'Nome fantasia', value: text(estabelecimento.nome_fantasia) },
    { label: 'Situacao cadastral', value: text(estabelecimento.situacao_cadastral) },
    { label: 'CNPJ', value: formatCnpj(String(data.cnpj_raiz ?? '') + String(estabelecimento.cnpj_ordem ?? '') + String(estabelecimento.cnpj_digito_verificador ?? '')) },
    { label: 'Data de abertura', value: formatDateValue(estabelecimento.data_inicio_atividade) },
    { label: 'Natureza juridica', value: text(naturezaJuridica.descricao) },
    { label: 'Porte', value: text(porte.descricao) },
    { label: 'Capital social', value: formatCurrencyBRL(data.capital_social) },
    { label: 'CNAE principal', value: text(atividadePrincipal.descricao) },
    { label: 'Endereco completo', value: address || 'Nao informado' },
    { label: 'Cidade / UF', value: [cidade.nome, estado.sigla].filter(Boolean).join(' / ') || 'Nao informado' },
    { label: 'CEP', value: formatPostalCode('BR', String(estabelecimento.cep ?? '')) || 'Nao informado' },
    { label: 'Telefone', value: phone ? formatPhone('BR', phone) : 'Nao informado' },
    { label: 'E-mail', value: text(estabelecimento.email) },
  ]

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold text-slate-900">Dados principais</h3>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <div className="rounded-2xl bg-slate-50 p-4" key={field.label}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{field.label}</p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-800">{field.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <h4 className="font-semibold text-slate-900">Inscricoes estaduais</h4>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {inscricoes.map((item, index) => {
            const record = getRecord(item)
            return (
              <div className="rounded-2xl border border-slate-100 p-4" key={`${String(record.inscricao_estadual ?? index)}`}>
                <p className="font-semibold text-slate-800">{text(record.inscricao_estadual)}</p>
                <p className="mt-1 text-sm text-slate-500">{text(record.estado ? getRecord(record.estado).sigla : record.uf)}</p>
              </div>
            )
          })}
          {!inscricoes.length && <p className="text-sm text-slate-500">Nenhuma inscricao estadual informada.</p>}
        </div>
      </div>
    </section>
  )
}
