interface DashboardErrorStateProps {
  message: string
  onRetry: () => void
}

export function DashboardErrorState({ message, onRetry }: DashboardErrorStateProps) {
  return (
    <div className="rounded-2xl border border-red-100 bg-red-50 p-6">
      <p className="text-sm font-semibold text-red-700">Nao foi possivel carregar o Dashboard.</p>
      <p className="mt-2 text-sm text-red-600">{message}</p>
      <button
        className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
        onClick={onRetry}
        type="button"
      >
        Tentar novamente
      </button>
    </div>
  )
}
