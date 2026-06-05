import { useEffect, useMemo, useState } from 'react'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import {
  checkGoogleBusinessData,
  disconnectGoogleBusiness,
  fetchGoogleBusinessLocations,
  loadGoogleBusinessStatus,
  selectGoogleBusinessLocation,
  startGoogleBusinessOAuth,
  syncGoogleBusinessData,
} from '../../services/googleBusinessService'
import type { GoogleBusinessStatus } from '../../types/googleBusiness'

interface GoogleBusinessProfilePanelProps {
  organizationId: string | null
}

export function GoogleBusinessProfilePanel({ organizationId }: GoogleBusinessProfilePanelProps) {
  const [status, setStatus] = useState<GoogleBusinessStatus | null>(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const selectedLocation = useMemo(
    () => status?.locations.find((location) => location.selected) ?? null,
    [status?.locations],
  )
  const hasOutdatedData = Boolean(
    selectedLocation?.syncStatus === 'Google desatualizado' ||
      status?.comparison.some((row) => row.status === 'Desatualizado' && row.googleField),
  )

  async function runAction(action: () => Promise<GoogleBusinessStatus | { locations: unknown[] }>, message: string) {
    if (!organizationId) {
      setError('Nenhum escritorio vinculado ao usuario.')
      return
    }

    setIsLoading(true)
    setError('')
    setFeedback('')
    try {
      const result = await action()
      if ('connection' in result) {
        setStatus(result)
      } else {
        setStatus(await loadGoogleBusinessStatus(organizationId))
      }
      setFeedback(message)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Nao foi possivel executar a acao.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!organizationId) return

    loadGoogleBusinessStatus(organizationId)
      .then(setStatus)
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar integracao Google.'),
      )
  }, [organizationId])

  return (
    <div className="mt-4 space-y-6">
      {feedback && <Alert type="success">{feedback}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-600">Google Business Profile</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">Google Meu Negocio / Perfil da Empresa</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Conecte a conta Google do contador, escolha a empresa vinculada e compare telefone,
              endereco, site, horario e descricao antes de enviar qualquer atualizacao.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
            Status: {status?.connection?.status ?? 'Nao conectado'}
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Button
            disabled={isLoading}
            onClick={() => organizationId && void startGoogleBusinessOAuth(organizationId)}
            type="button"
          >
            Conectar Google
          </Button>
          <Button
            disabled={isLoading || !status?.connection}
            onClick={() =>
              void runAction(
                () => fetchGoogleBusinessLocations(organizationId ?? ''),
                'Selecione qual empresa do Google deseja vincular.',
              )
            }
            type="button"
            variant="secondary"
          >
            Carregar empresas
          </Button>
          <Button
            disabled={isLoading || !selectedLocation}
            onClick={() =>
              void runAction(
                () => checkGoogleBusinessData(organizationId ?? ''),
                'Verificacao concluida. Veja a comparacao abaixo.',
              )
            }
            type="button"
            variant="secondary"
          >
            Verificar dados no Google
          </Button>
          <Button
            disabled={isLoading || !status?.connection}
            onClick={() =>
              void runAction(
                () => disconnectGoogleBusiness(organizationId ?? ''),
                'Google desconectado com sucesso.',
              )
            }
            type="button"
            variant="ghost"
          >
            Desconectar Google
          </Button>
        </div>

        {status?.connection?.connectedEmail && (
          <p className="mt-4 text-sm text-slate-500">
            Conta conectada: <span className="font-semibold text-slate-700">{status.connection.connectedEmail}</span>
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Empresa vinculada</h3>
        <p className="mt-2 text-sm text-slate-500">
          Cada contador visualiza e salva apenas as empresas da propria conta conectada.
        </p>
        <select
          className="mt-5 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
          disabled={!status?.locations.length || isLoading}
          onChange={(event) =>
            void runAction(
              () => selectGoogleBusinessLocation(organizationId ?? '', event.target.value),
              'Empresa do Google vinculada.',
            )
          }
          value={selectedLocation?.id ?? ''}
        >
          <option value="">Selecione qual empresa do Google deseja vincular.</option>
          {status?.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.businessName || location.googleLocationName}
            </option>
          ))}
        </select>
        {selectedLocation && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p><strong>Status:</strong> {selectedLocation.syncStatus}</p>
            <p><strong>Local:</strong> {selectedLocation.googleLocationName}</p>
            {selectedLocation.lastCheckedAt && <p><strong>Ultima verificacao:</strong> {new Date(selectedLocation.lastCheckedAt).toLocaleString('pt-BR')}</p>}
          </div>
        )}
      </section>

      {status?.comparison.some((row) => row.status === 'Desatualizado') && (
        <Alert type="warning">Existem informacoes diferentes entre seu sistema e o Google.</Alert>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Comparacao de dados</h3>
            <p className="mt-2 text-sm text-slate-500">Nada e atualizado automaticamente. O contador sempre confirma antes.</p>
          </div>
          {hasOutdatedData && (
            <Button
              disabled={isLoading}
              onClick={() =>
                void runAction(
                  () => syncGoogleBusinessData(organizationId ?? ''),
                  'Atualizacao enviada para o Google. O Google pode levar algum tempo para aprovar e publicar as alteracoes.',
                )
              }
              type="button"
            >
              Mandar atualizar no Google
            </Button>
          )}
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-4">Campo</th>
                <th className="pb-4">Valor no sistema</th>
                <th className="pb-4">Valor no Google</th>
                <th className="pb-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {status?.comparison.map((row) => (
                <tr className="border-t border-slate-100" key={row.key}>
                  <td className="py-4 font-semibold text-slate-900">{row.label}</td>
                  <td className="max-w-xs py-4 text-slate-600">{row.systemValue}</td>
                  <td className="max-w-xs py-4 text-slate-600">{row.googleValue}</td>
                  <td className="py-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      row.status === 'Atualizado'
                        ? 'bg-emerald-50 text-emerald-700'
                        : row.status === 'Desatualizado'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!status?.comparison.length && (
            <p className="py-10 text-center text-sm text-slate-500">
              Conecte o Google, carregue as empresas e clique em Verificar dados no Google.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Historico de sincronizacoes</h3>
        <div className="mt-5 space-y-3">
          {status?.logs.map((log) => (
            <div className="rounded-xl border border-slate-100 p-4" key={log.id}>
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <p className="font-semibold text-slate-900">{log.action}</p>
                <span className="text-sm text-slate-500">{new Date(log.createdAt).toLocaleString('pt-BR')}</span>
              </div>
              <p className="mt-2 text-sm text-slate-500">Status: {log.status}</p>
              <p className="mt-1 text-sm text-slate-500">Usuario: {log.userEmail || 'Nao informado'}</p>
              <p className="mt-1 text-sm text-slate-500">Campos enviados: {log.fieldsSent.length ? log.fieldsSent.join(', ') : 'Nenhum'}</p>
              {log.errorMessage && <p className="mt-1 text-sm text-rose-600">{log.errorMessage}</p>}
            </div>
          ))}
          {!status?.logs.length && <p className="py-8 text-center text-sm text-slate-500">Nenhum historico registrado.</p>}
        </div>
      </section>
    </div>
  )
}
